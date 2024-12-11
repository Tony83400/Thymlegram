'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import CryptoJS from 'crypto-js';
import Link from 'next/link';
import { Toaster, toast } from 'sonner';

const ENCRYPTION_KEY = "jXn2r5u8x/A?D(G+KbPeShVmYq3t6w9z";

type Message = {
  id: number;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
};

type Contact = {
  id: string;
  username: string;
  lastMessage?: string;
};

const encryptMessage = (message: string) => {
  return CryptoJS.AES.encrypt(message, ENCRYPTION_KEY).toString();
};

const decryptMessage = (encryptedMessage: string) => {
  const bytes = CryptoJS.AES.decrypt(encryptedMessage, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [newContactUsername, setNewContactUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  useEffect(() => {
    const fetchUserAndData = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw authError;
        
        if (user) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('id', user.id)
            .maybeSingle();

          if (profileError && profileError.code !== 'PGRST116') {
            console.error("Erreur profil:", profileError);
            throw profileError;
          }

          if (profileData) {
            setUser({ ...user, username: profileData.username });
          } else {
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({ 
                id: user.id, 
                username: user.email?.split('@')[0] || 'Utilisateur' 
              });

            if (insertError) throw insertError;

            setUser({ 
              ...user, 
              username: user.email?.split('@')[0] || 'Utilisateur'
            });
          }

          await fetchContacts(user.id);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
        setErrorMessage("Erreur lors du chargement des données");
      } finally {
        setLoading(false);
      }
    };

    fetchUserAndData();
  }, []);

  useEffect(() => {
    if (user && selectedContact) {
      fetchMessages(user.id, selectedContact.id);
      const intervalId = setInterval(() => {
        fetchMessages(user.id, selectedContact.id);
      }, 1000);
      return () => clearInterval(intervalId);
    }
  }, [selectedContact, user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`messages_notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `or(sender_id=eq.${user.id},receiver_id=eq.${user.id})`,
        },
        async (payload) => {
          if (payload.eventType !== 'INSERT') return;
          
          try {
            const { data: senderData, error } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', payload.new.sender_id)
              .single();

            if (error) throw error;

            const decryptedContent = decryptMessage(payload.new.content);
            
            const audio = new Audio('/notification.mp3');
            await audio.play().catch(e => console.error('Erreur audio:', e));

            toast.success('Nouveau message', {
              description: `${senderData?.username}: ${decryptedContent.substring(0, 50)}${decryptedContent.length > 50 ? '...' : ''}`,
              duration: 5000,
              important: true,
            });

            if (selectedContact?.id === payload.new.sender_id || selectedContact?.id === payload.new.receiver_id) {
              setMessages((prevMessages) => [
                ...prevMessages,
                {
                  ...payload.new,
                  content: decryptedContent
                }
              ]);
              setTimeout(scrollToBottom, 100);
            }
            
            await fetchContacts(user.id);
            
          } catch (error) {
            console.error('Erreur complète notification message:', error);
          }
        }
      );

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscription aux messages établie avec succès');
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, selectedContact?.id]);

  const fetchContacts = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('contact_id, profiles:contact_id(id, username)')
        .eq('user_id', userId);

      if (error) throw error;

      const contactsWithLastMessage = await Promise.all(data.map(async (contact: any) => {
        const { data: lastMessageData, error: lastMessageError } = await supabase
          .from('messages')
          .select('content')
          .or(`and(sender_id.eq.${userId},receiver_id.eq.${contact.profiles.id}),and(sender_id.eq.${contact.profiles.id},receiver_id.eq.${userId})`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (lastMessageError && lastMessageError.code !== 'PGRST116') {
          console.error("Erreur lors de la récupération du dernier message:", lastMessageError);
        }

        let lastMessage = '';
        if (lastMessageData?.content) {
          const decryptedMessage = decryptMessage(lastMessageData.content);
          lastMessage = decryptedMessage.substring(0, 30) + (decryptedMessage.length > 30 ? '...' : '');
        }

        return {
          id: contact.profiles.id,
          username: contact.profiles.username,
          lastMessage: lastMessage
        };
      }));

      setContacts(contactsWithLastMessage);
    } catch (error) {
      console.error("Erreur lors de la récupération des contacts:", error);
      setErrorMessage("Erreur lors de la récupération des contacts");
    }
  };

  const fetchMessages = async (userId: string, contactId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${userId})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const decryptedMessages = data.map(message => ({
        ...message,
        content: decryptMessage(message.content)
      }));

      setMessages(decryptedMessages);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Erreur lors de la récupération des messages:", error);
      setErrorMessage("Erreur lors de la récupération des messages");
    }
  };

  const sendMessage = async () => {
    if (!user || !selectedContact || !newMessage.trim()) return;

    try {
      const encryptedContent = encryptMessage(newMessage.trim());

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: selectedContact.id,
          content: encryptedContent
        })
        .select();

      if (error) throw error;

      const sentMessage = {
        ...data[0],
        content: newMessage.trim()
      };

      setMessages([...messages, sentMessage]);
      setNewMessage('');
      await fetchContacts(user.id);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Erreur lors de l'envoi du message:", error);
      setErrorMessage("Erreur lors de l'envoi du message");
    }
  };

  const addContact = async () => {
    if (!user || !newContactUsername.trim()) return;

    try {
      if (!user.username || newContactUsername.trim().toLowerCase() === user.username.toLowerCase()) {
        setErrorMessage("Vous ne pouvez pas vous ajouter vous-même comme contact.");
        return;
      }

      const { data: contactUser, error: userError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', newContactUsername.trim())
        .single();

      if (userError) {
        setErrorMessage("Utilisateur introuvable");
        return;
      }

      const { data: existingContact, error: existingContactError } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .eq('contact_id', contactUser.id)
        .single();

      if (existingContact) {
        setErrorMessage("Ce contact existe déjà");
        return;
      }

      const { error } = await supabase
        .from('contacts')
        .insert([
          { user_id: user.id, contact_id: contactUser.id },
          { user_id: contactUser.id, contact_id: user.id }
        ]);

      if (error) throw error;

      await fetchContacts(user.id);
      setNewContactUsername('');
      setErrorMessage('');
    } catch (error) {
      console.error("Erreur lors de l'ajout du contact:", error);
      setErrorMessage("Erreur lors de l'ajout du contact");
    }
  };

  const handleKeyPressForContact = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      addContact();
    }
  };

  const playNotificationSound = () => {
    const audio = new Audio('/notification.mp3'); // Assurez-vous d'avoir ce fichier dans votre dossier public
    audio.play().catch(e => console.log('Erreur audio:', e));
  };

  if (loading) {
    return <div>Chargement...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Toaster 
        position="bottom-left"
        toastOptions={{
          style: {
            background: '#333',
            color: '#fff',
          },
          className: 'my-toast-class',
        }}
      />
      
      <div className="w-1/3 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">Messages</h2>
          <div className="text-sm text-gray-500 mt-1">
            Connecté en tant que {user?.username || 'Chargement...'}
          </div>
          <Link href="/temporary-messages" className="mt-2 inline-block">
            <Button>Messages Temporaires</Button>
          </Link>
        </div>
        <ScrollArea className="flex-grow">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={`p-4 cursor-pointer hover:bg-gray-100 ${
                selectedContact?.id === contact.id ? 'bg-gray-100' : ''
              }`}
              onClick={() => setSelectedContact(contact)}
            >
              <div className="font-semibold">{contact.username}</div>
              {contact.lastMessage && (
                <div className="text-sm text-gray-500">{contact.lastMessage}</div>
              )}
            </div>
          ))}
        </ScrollArea>
        <div className="p-4 border-t">
          <Input
            type="text"
            placeholder="Ajouter un contact"
            value={newContactUsername}
            onChange={(e) => setNewContactUsername(e.target.value)}
            onKeyPress={handleKeyPressForContact}
          />
          <Button onClick={addContact} className="w-full mt-2">
            Ajouter
          </Button>
          {errorMessage && <p className="text-red-500 mt-2">{errorMessage}</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedContact ? (
          <>
            <div className="p-4 border-b bg-white">
              <h2 className="text-xl font-semibold">{selectedContact.username}</h2>
            </div>
            <ScrollArea className="flex-grow p-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.sender_id === user.id ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`p-3 rounded-lg max-w-[70%] ${
                        message.sender_id === user.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-4 bg-white border-t flex">
              <Input
                type="text"
                placeholder="Tapez votre message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    sendMessage();
                  }
                }}
                className="flex-1 mr-2"
              />
              <Button onClick={sendMessage}>Envoyer</Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Sélectionnez une conversation pour commencer
          </div>
        )}
      </div>
    </div>
  );
}
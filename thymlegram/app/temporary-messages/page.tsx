'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import * as CryptoJS from 'crypto-js';
import Link from 'next/link';
import { RealtimeChannel } from 'realtime-js';

const ENCRYPTION_KEY = "jXn2r5u8x/A?D(G+KbPeShVmYq3t6w9z";

type TempMessage = {
  id: number;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
};

type TempContact = {
  id: string;
  username: string;
  expires_at: string;
  lastMessage?: string;
};

export default function TemporaryMessages() {
  const [messages, setMessages] = useState<TempMessage[]>([]);
  const [contacts, setContacts] = useState<TempContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<TempContact | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [newContactUsername, setNewContactUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [newContactDuration, setNewContactDuration] = useState<number>(10);
  const [remainingTime, setRemainingTime] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [tempContacts, setTempContacts] = useState<any[]>([]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  const encryptMessage = (message: string) => {
    return CryptoJS.AES.encrypt(message, ENCRYPTION_KEY).toString();
  };

  const decryptMessage = (encryptedMessage: string) => {
    const bytes = CryptoJS.AES.decrypt(encryptedMessage, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  };

  useEffect(() => {
    const fetchUserAndData = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) throw authError;

        if (!user) return;

        setUser(user);
        
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single();
        
        if (profileError) throw profileError;

        if (profileData && profileData.username) {
          setUsername(profileData.username);
        } else {
          setErrorMessage("Profil utilisateur incomplet");
        }

        await fetchTempContacts(user.id);
      } catch (error) {
        setErrorMessage("Erreur lors du chargement des données utilisateur");
      }
    };

    fetchUserAndData();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await fetchUserAndData();
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const fetchTempContacts = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('temp_contacts')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      setContacts(data);
    } catch (error) {
      setErrorMessage("Erreur lors de la récupération des contacts temporaires");
    }
  };

  const fetchTempMessages = async () => {
    if (!selectedContact || !user) return;

    try {
      const { data, error } = await supabase
        .from('temp_messages')
        .select('*')
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${selectedContact.contact_user_id}),` +
          `and(sender_id.eq.${selectedContact.contact_user_id},receiver_id.eq.${user.id})`
        )
        .order('created_at', { ascending: true });

      if (error) throw error;

      const decryptedMessages = data?.map(message => ({
        ...message,
        content: decryptMessage(message.content)
      })) || [];

      setMessages(decryptedMessages);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Erreur récupération messages:", error);
    }
  };

  useEffect(() => {
    if (!selectedContact || !user) return;
    
    // Récupérer les messages initiaux
    fetchTempMessages();

    // Configurer un intervalle pour récupérer les messages régulièrement
    const messageInterval = setInterval(fetchTempMessages, 3000);

    // Configurer la souscription en temps réel
    const channel = supabase.channel(`temp_messages_${selectedContact.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'temp_messages',
          filter: `or(and(sender_id.eq.${user.id},receiver_id.eq.${selectedContact.contact_user_id}),and(sender_id.eq.${selectedContact.contact_user_id},receiver_id.eq.${user.id}))`
        },
        (payload) => {
          fetchTempMessages();
        }
      )
      .subscribe();

    // Nettoyage
    return () => {
      clearInterval(messageInterval);
      supabase.removeChannel(channel);
    };
  }, [selectedContact, user]);

  const sendTempMessage = async () => {
    if (!user || !selectedContact || !newMessage.trim()) return;

    try {
      const encryptedContent = encryptMessage(newMessage.trim());
      const messageToSend = {
        sender_id: user.id,
        receiver_id: selectedContact.contact_user_id,
        content: encryptedContent,
        conversation_id: selectedContact.id
      };

      const { error } = await supabase
        .from('temp_messages')
        .insert(messageToSend);

      if (error) throw error;

      setNewMessage('');
      
      // Attendre un court instant avant de recharger les messages
      setTimeout(() => {
        fetchTempMessages();
      }, 100);

    } catch (error) {
      console.error("Erreur lors de l'envoi du message:", error);
      setErrorMessage("Erreur lors de l'envoi du message");
    }
  };

  const addTempContact = async () => {
    if (!user || !newContactUsername.trim()) {
      setErrorMessage("Veuillez entrer un nom d'utilisateur");
      return;
    }

    try {
      const { data: contactUser, error: userError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', newContactUsername.trim())
        .single();

      if (userError || !contactUser) {
        setErrorMessage("Cet utilisateur n'existe pas");
        return;
      }

      if (contactUser.id === user.id) {
        setErrorMessage("Vous ne pouvez pas vous ajouter vous-même en contact.");
        return;
      }
      
      // Vérifier si le contact existe déjà
      const { data: existingContact, error: existingError } = await supabase
        .from('temp_contacts')
        .select('*')
        .or(
          `and(user_id.eq.${user.id},contact_user_id.eq.${contactUser.id})`,
          `and(user_id.eq.${contactUser.id},contact_user_id.eq.${user.id})`
        );

      if (existingContact && existingContact.length > 0) {
        setErrorMessage("Ce contact temporaire existe déjà.");
        return;
      }

      const expiresAt = new Date(Date.now() + newContactDuration * 60000).toISOString();
      const contactId = crypto.randomUUID();

      const newContact = {
        id: contactId,
        user_id: user.id,
        contact_user_id: contactUser.id,
        username: contactUser.username,
        expires_at: expiresAt
      };

      const { error: insertError } = await supabase
        .from('temp_contacts')
        .insert(newContact);

      if (insertError) throw insertError;

      // Créer l'entrée inverse pour l'autre utilisateur
      const reverseContact = {
        id: crypto.randomUUID(),
        user_id: contactUser.id,
        contact_user_id: user.id,
        username: username,
        expires_at: expiresAt
      };

      const { error: reverseInsertError } = await supabase
        .from('temp_contacts')
        .insert(reverseContact);

      if (reverseInsertError) throw reverseInsertError;

      // Rafraîchir la liste des contacts
      await fetchTempContacts(user.id);
      setNewContactUsername('');
      setErrorMessage('');

    } catch (error) {
      setErrorMessage("Une erreur est survenue lors de l'ajout du contact");
    }
  };

  const handleKeyPressForContact = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTempContact();
    }
  };

  const calculateRemainingTime = (expiresAt: string) => {
    const now = new Date();
    const expiration = new Date(expiresAt);
    const diff = expiration.getTime() - now.getTime();
    
    if (diff <= 0) return "Expiré";
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    return `${minutes}m ${seconds}s`;
  };

  useEffect(() => {
    if (!selectedContact) return;

    const timer = setInterval(() => {
      setRemainingTime(calculateRemainingTime(selectedContact.expires_at));
    }, 1000);

    return () => clearInterval(timer);
  }, [selectedContact]);

  const stopConversation = async () => {
    if (!user || !selectedContact) return;

    try {
      // Supprimer tous les messages liés aux deux utilisateurs
      const { error: messagesError } = await supabase
        .from('temp_messages')
        .delete()
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${selectedContact.contact_user_id}),` +
          `and(sender_id.eq.${selectedContact.contact_user_id},receiver_id.eq.${user.id})`
        );

      if (messagesError) throw messagesError;

      // Supprimer les contacts dans les deux sens
      const { error: contactsError } = await supabase
        .from('temp_contacts')
        .delete()
        .or(
          `and(user_id.eq.${user.id},contact_user_id.eq.${selectedContact.contact_user_id}),` +
          `and(user_id.eq.${selectedContact.contact_user_id},contact_user_id.eq.${user.id})`
        );

      if (contactsError) throw contactsError;

      // Réinitialiser l'interface locale
      setSelectedContact(null);
      setMessages([]);
      setContacts(prevContacts => prevContacts.filter(contact => 
        contact.id !== selectedContact.id
      ));
      
    } catch (error) {
      console.error("Erreur lors de l'arrêt de la conversation:", error);
      setErrorMessage("Erreur lors de l'arrêt de la conversation");
    }
  };

  // Modifier également l'effet de surveillance des contacts
  useEffect(() => {
    if (!user) return;

    const fetchTempContacts = async () => {
      try {
        const { data, error } = await supabase
          .from('temp_contacts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error) throw error;

        setContacts(data || []);
        
        if (selectedContact && !data?.some(contact => contact.id === selectedContact.id)) {
          setSelectedContact(null);
          setMessages([]);
        }
      } catch (error) {
        setErrorMessage("Erreur lors du chargement des contacts");
      }
    };

    // Configurer les souscriptions pour les changements
    const channelAsUser = supabase.channel('temp_contacts_as_user')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'temp_contacts',
          filter: `user_id=eq.${user.id}`
        },
        async () => {
          await fetchTempContacts();
        }
      )
      .subscribe();

    const channelAsContact = supabase.channel('temp_contacts_as_contact')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'temp_contacts',
          filter: `contact_user_id=eq.${user.id}`
        },
        async () => {
          await fetchTempContacts();
        }
      )
      .subscribe();

    // Charger les contacts initiaux
    fetchTempContacts();

    // Configurer un intervalle pour rafraîchir les contacts toutes les 10 secondes
    const refreshInterval = setInterval(fetchTempContacts, 10000);

    // Nettoyage
    return () => {
      supabase.removeChannel(channelAsUser);
      supabase.removeChannel(channelAsContact);
      clearInterval(refreshInterval);
    };
  }, [user, selectedContact]);

  const cleanExpiredConversations = async () => {
    if (!user) return;
    
    try {
      const { data: expiredContacts, error: selectError } = await supabase
        .from('temp_contacts')
        .select('id')
        .lt('expires_at', new Date().toISOString());

      if (selectError) throw selectError;
      
      if (expiredContacts && expiredContacts.length > 0) {
        const { error: messagesError } = await supabase
          .from('temp_messages')
          .delete()
          .in('conversation_id', expiredContacts.map(contact => contact.id));

        if (messagesError) throw messagesError;

        const { error: contactsError } = await supabase
          .from('temp_contacts')
          .delete()
          .lt('expires_at', new Date().toISOString());

        if (contactsError) throw contactsError;
        
        await fetchTempContacts(user.id);
      }
    } catch (error) {
      setErrorMessage("Erreur lors du nettoyage des conversations expirées");
    }
  };

  // Ajouter un useEffect pour appeler la fonction régulièrement
  useEffect(() => {
    if (!user) return;

    // Première exécution
    cleanExpiredConversations();

    // Configurer un intervalle pour vérifier toutes les 30 secondes
    const cleanupInterval = setInterval(() => {
      cleanExpiredConversations();
    }, 30000); // 30 secondes

    // Nettoyer l'intervalle lors du démontage du composant
    return () => {
      clearInterval(cleanupInterval);
    };
  }, [user]); // Dépendance à user pour que l'effet se réinitialise si l'utilisateur change

  return (
    <div className="flex h-screen bg-green-50">
      <div className="w-1/3 bg-green-50 border-r flex flex-col">
        <div className="p-4 border-b bg-green-100 flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            Utilisateur: {username || 'Non connecté'}
          </h2>
          <Link href="/messages">
            <Button className="bg-emerald-200 hover:bg-emerald-300 text-black">Messages Classiques</Button>
          </Link>
        </div>
        <h2 className="text-2xl font-bold p-4 border-b bg-green-50">Contacts Temporaires</h2>
        <ScrollArea className="flex-grow">
          {contacts?.length === 0 ? (
            <div className="p-4 text-gray-500">
              Aucun contact temporaire
            </div>
          ) : (
            contacts?.map(contact => (
              <div
                key={contact.id}
                className="p-2 hover:bg-green-100 cursor-pointer"
                onClick={() => setSelectedContact(contact)}
              >
                <div className="font-semibold">{contact.username}</div>
                {contact.lastMessage && (
                  <div className="text-sm text-gray-500 truncate">{contact.lastMessage}</div>
                )}
              </div>
            ))
          )}
        </ScrollArea>
        <div className="p-4 border-t bg-green-50">
          <Input
            type="text"
            placeholder="Nom d'utilisateur du contact"
            value={newContactUsername}
            onChange={(e) => setNewContactUsername(e.target.value)}
            onKeyDown={handleKeyPressForContact}
            className="mb-2"
          />
          <Input
            type="number"
            placeholder="Durée (minutes)"
            value={newContactDuration}
            onChange={(e) => setNewContactDuration(parseInt(e.target.value) || 10)}
            className="mb-2"
            min="1"
            max="60"
          />
          <Button 
            onClick={addTempContact} 
            className="bg-emerald-200 hover:bg-emerald-300 text-black"
          >
            Ajouter un contact temporaire
          </Button>
          {errorMessage && <p className="text-red-500 text-sm mt-2">{errorMessage}</p>}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedContact ? (
          <>
            <div className="bg-green-100 p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">{selectedContact.username}</h2>
              <div className="flex items-center">
                <span className="mr-4">Temps restant: {remainingTime}</span>
                <Button 
                  onClick={stopConversation} 
                  className="bg-emerald-200 hover:bg-emerald-300 text-black"
                >
                  Arrêter la conversation
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-grow p-4 bg-green-50" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={`${message.id}-${index}`}
                    className={`flex ${message.sender_id === user?.id ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        message.sender_id === user?.id
                          ? "bg-blue-500 text-white"
                          : "bg-gray-300"
                      } max-w-[70%] break-all relative group`}
                    >
                      {message.content.split('\n').map((line, lineIndex) => (
                        <p key={`${message.id}-${index}-${lineIndex}`} className="mb-1">
                          {line}
                        </p>
                      ))}
                      <span className="absolute bottom-0 right-0 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-in-out bg-black text-white px-1 py-0.5 rounded">
                        {new Date(message.created_at).toLocaleString('fr-FR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-4 bg-green-50 border-t flex">
              <textarea
                placeholder="Tapez un message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendTempMessage();
                  }
                }}
                className="flex-1 mr-2 p-2 border rounded resize-none overflow-y-auto"
                style={{ minHeight: '40px', maxHeight: '150px' }}
              />
              <Button className="bg-emerald-200 hover:bg-emerald-300 text-black">Envoyer</Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full bg-green-50">
            <p className="text-xl text-gray-500">Sélectionnez un contact pour commencer à discuter</p>
          </div>
        )}
      </div>
    </div>
  );
}

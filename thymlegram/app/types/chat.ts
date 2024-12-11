export type Message = {
  id: number;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  conversation_id?: string;
};

export type Contact = {
  id: string;
  username: string;
  expires_at?: string;
  lastMessage?: string;
  contact_user_id?: string;
};

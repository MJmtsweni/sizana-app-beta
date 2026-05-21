import { supabase } from './supabase';

export const chatService = {
  // Send a private message
  async sendMessage(receiverId: string, content: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase
      .from('direct_messages')
      .insert([{ 
        sender_id: user.id, 
        receiver_id: receiverId, 
        content 
      }]);

    if (error) throw error;
  },

  // Fetch conversation between two specific users
  async getConversation(otherUserId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  },

  async getInbox() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Fetch messages where user is sender OR receiver
    // We select the sender/receiver details to show names/avatars in the inbox
    const { data, error } = await supabase
      .from('direct_messages')
      .select(`
        *,
        sender:sender_id(username, avatar_url),
        receiver:receiver_id(username, avatar_url)
      `)
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Inbox Fetch Error:", error.message);
      return [];
    }

    // Deduplication Logic: Keep only the newest message for each unique contact
    const latestMessages = new Map();
    
    data.forEach((msg: any) => {
      // Identify the "other" person in the chat
      const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      
      // Since we ordered by created_at DESC, the first time we see a contact, 
      // it's the most recent message.
      if (!latestMessages.has(otherId)) {
        latestMessages.set(otherId, {
          ...msg,
          otherUser: msg.sender_id === user.id ? msg.receiver : msg.sender
        });
      }
    });

    return Array.from(latestMessages.values());
  },

  async markAsRead(messageId: string) {
    const { error } = await supabase
      .from('direct_messages')
      .update({ is_read: true })
      .eq('id', messageId);
    
    if (error) console.error("Update Status Error:", error.message);
  }
};
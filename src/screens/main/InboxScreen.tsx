import React, { useEffect, useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TextInput, 
  TouchableOpacity, KeyboardAvoidingView, Platform, 
  ActivityIndicator, Image, Alert 
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function InboxScreen({ route, navigation, session: directSession }: any) {
  const session = route?.params?.session || directSession || route?.params?.params?.session;
  const marketplaceParam = route?.params?.params || route?.params;

  const onGoBack = route?.params?.onGoBack || route?.params?.params?.onGoBack;

  const [messages, setMessages] = useState<any[]>([]);
  const [activeChatPartner, setActiveChatPartner] = useState<string | null>(null);
  const [activeChatName, setActiveChatName] = useState<string>('Messages');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  
  const [conversations, setConversations] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (marketplaceParam?.sellerId) {
      setActiveChatPartner(marketplaceParam.sellerId);
      setActiveChatName(marketplaceParam.sellerName || 'Trader');
      setActiveItemId(marketplaceParam.itemId || null);
      
      setNewMessage(`Hi, is "${marketplaceParam.itemTitle}" still available?`);
      fetchChatMessages(marketplaceParam.sellerId);
      markMessagesAsRead(marketplaceParam.sellerId);
    } else {
      fetchConversationsSummary();
    }
  }, [marketplaceParam]);

  // --- REAL-TIME DETECTOR WITH STATUS TOGGLE SYNC ---
  useEffect(() => {
    if (!session?.user?.id || !activeChatPartner) return;

    const chatChannel = supabase
  .channel(`chat-room-${activeChatPartner}`)
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'messages' },
    (payload: any) => { // <--- FIXED: Added ': any' typing override right here
      if (payload.event === 'INSERT') {
        const incoming = payload.new;
        const isFromPartner = incoming.sender_id === activeChatPartner && incoming.receiver_id === session.user.id;
        const isFromMe = incoming.sender_id === session.user.id && incoming.receiver_id === activeChatPartner;

        if (isFromPartner || isFromMe) {
          setMessages((prev) => {
            if (prev.some(m => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
          
          if (isFromPartner) {
            markMessagesAsRead(activeChatPartner);
          }
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
        }
      } else if (payload.event === 'UPDATE') {
        const updated = payload.new;
        setMessages((prev) => prev.map(m => m.id === updated.id ? updated : m));
      }
    }
  )
  .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
    };
  }, [activeChatPartner, session?.user?.id]);

  // Mark all incoming messages from this partner as read
  async function markMessagesAsRead(partnerId: string) {
    const targetPartnerId = partnerId || activeChatPartner || marketplaceParam?.sellerId;

    if (!session?.user?.id || !targetPartnerId) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('receiver_id', session.user.id) 
        .eq('sender_id', targetPartnerId)   
        .eq('is_read', false)                
        .select(); 

      if (error) throw error;

      if (data && data.length > 0) {
        fetchConversationsSummary();
      }
    } catch (e: any) {
      console.error("Read update error:", e.message);
    }
  }

  async function fetchConversationsSummary() {
    try {
      setLoading(true);
      if (!session?.user?.id) return;

      const { data, error } = await supabase
        .from('messages')
        .select(`
          id, content, created_at, sender_id, receiver_id, is_read,
          sender:sender_id ( username, avatar_url ),
          receiver:receiver_id ( username, avatar_url )
        `)
        .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const uniqueChats: any = {};
        data.forEach((msg: any) => {
          const partnerId = msg.sender_id === session.user.id ? msg.receiver_id : msg.sender_id;
          const partnerProfile = msg.sender_id === session.user.id ? msg.receiver : msg.sender;
          
          // Count unread messages specifically sent *to* us by this sender
          const isUnreadInbound = (msg.receiver_id === session.user.id && !msg.is_read);

          if (!uniqueChats[partnerId]) {
            uniqueChats[partnerId] = {
              id: msg.id,
              lastMessage: msg.content,
              timestamp: msg.created_at,
              partnerId,
              partnerName: partnerProfile?.username || 'Sizana Member',
              partnerAvatar: partnerProfile?.avatar_url || null,
              unreadCount: isUnreadInbound ? 1 : 0
            };
          } else if (isUnreadInbound) {
            uniqueChats[partnerId].unreadCount += 1;
          }
        });
        setConversations(Object.values(uniqueChats));
      }
    } catch (error: any) {
      console.error('Error summaries:', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchChatMessages(partnerId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${session.user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data) {
        setMessages(data);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
      }
    } catch (error: any) {
      Alert.alert('Error loading thread', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage() {
    if (!newMessage.trim() || !activeChatPartner || !session?.user?.id) return;

    const messageContent = newMessage.trim();
    setNewMessage('');

    const localOptimisticMessage = {
      id: `temp-${Date.now()}`,
      created_at: new Date().toISOString(),
      sender_id: session.user.id,
      receiver_id: activeChatPartner,
      item_id: activeItemId,
      content: messageContent,
      is_read: false
    };

    setMessages((prev) => [...prev, localOptimisticMessage]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          sender_id: session.user.id,
          receiver_id: activeChatPartner,
          item_id: activeItemId,
          content: messageContent,
        });

      if (error) throw error;
    } catch (error: any) {
      setMessages((prev) => prev.filter(m => m.id !== localOptimisticMessage.id));
      Alert.alert('Message send error', error.message);
    }
  }

  const handleBackToList = () => {
  setActiveChatPartner(null);
  
  navigation.setParams({ 
    sellerId: undefined, 
    sellerName: undefined, 
    itemTitle: undefined, 
    itemId: undefined 
  });
  
  fetchConversationsSummary();

  // If they launched this specific thread directly from a product listing,
  // back out to the marketplace. Otherwise, just collapse the chat window.
  if (marketplaceParam?.sellerId) {
    navigation.goBack();
  }
};

  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const renderConversationItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={[styles.convoCard, item.unreadCount > 0 && styles.convoCardUnread]} 
      onPress={async () => {
        await markMessagesAsRead(item.partnerId);
        setActiveChatPartner(item.partnerId);
        setActiveChatName(item.partnerName);
        fetchChatMessages(item.partnerId);
      }}
    >
      <View style={styles.avatarFrame}>
        {item.partnerAvatar ? (
          <Image source={{ uri: item.partnerAvatar }} style={styles.avatarImg} />
        ) : (
          <Ionicons name="person-circle" size={48} color="#CBD5E1" />
        )}
      </View>
      <View style={styles.convoDetails}>
        <Text style={[styles.partnerNameText, item.unreadCount > 0 && styles.textBolded]}>{item.partnerName}</Text>
        <Text style={[styles.lastMessageText, item.unreadCount > 0 && styles.textDarkened]} numberOfLines={1}>{item.lastMessage}</Text>
      </View>
      
      {/* Dynamic Unread Numeric Badge Count Pill */}
      {item.unreadCount > 0 ? (
        <View style={styles.unreadCounterBadge}>
          <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      )}
    </TouchableOpacity>
  );

  const renderMessageBubble = ({ item }: { item: any }) => {
    const isMine = item.sender_id === session?.user?.id;
    return (
      <View style={[styles.bubbleWrapper, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <View style={[styles.bubbleContainer, isMine ? styles.containerMine : styles.containerTheirs]}>
          <Text style={[styles.bubbleText, isMine ? styles.textMine : styles.textTheirs]}>{item.content}</Text>
          
          {/* Real-time Status Checkmark Row and Timestamp Layout */}
          <View style={styles.bubbleStatusMetaRow}>
            <Text style={[styles.timestampText, isMine ? styles.timestampMine : styles.timestampTheirs]}>
              {formatTime(item.created_at)}
            </Text>
            {isMine && (
              <Ionicons 
                name={item.is_read ? "checkmark-done" : "checkmark"} 
                size={14} 
                color={item.is_read ? "#6EE7B7" : "#E2E8F0"} 
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  if (activeChatPartner) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 60} style={styles.chatWindow}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={handleBackToList} style={styles.headerBackButton}>
            <Ionicons name="arrow-back" size={22} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitleText}>{activeChatName}</Text>
          <View style={{ width: 32 }} />
        </View>

        {loading && messages.length === 0 ? (
          <View style={styles.centered}><ActivityIndicator color="#34C759" size="large" /></View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageBubble}
            contentContainerStyle={styles.messagesScrollList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        <View style={styles.inputDockContainer}>
          <TextInput
            style={styles.chatInputField}
            placeholder="Type your message..."
            value={newMessage}
            onChangeText={setNewMessage}
            placeholderTextColor="#94A3B8"
            multiline
          />
          <TouchableOpacity style={styles.sendActionButton} onPress={handleSendMessage}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <View style={styles.inboxTitleBlock}>
        <Text style={styles.mainInboxTitle}>Inbox Messages</Text>
      </View>

      {loading && conversations.length === 0 ? (
        <View style={styles.centered}><ActivityIndicator color="#34C759" size="large" /></View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.partnerId}
          renderItem={renderConversationItem}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={styles.emptyInboxLayout}>
              <Ionicons name="chatbubbles-outline" size={60} color="#CBD5E1" />
              <Text style={styles.emptyInboxText}>Your messaging history is currently empty.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  chatWindow: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  inboxTitleBlock: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#fff' },
  mainInboxTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B' },
  convoCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 14, borderRadius: 16, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  convoCardUnread: { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' },
  avatarFrame: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#F1F5F9', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  convoDetails: { flex: 1, marginLeft: 14 },
  partnerNameText: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  lastMessageText: { fontSize: 13, color: '#64748B', fontWeight: '500', marginTop: 3, width: '90%' },
  textBolded: { fontWeight: '800', color: '#065F46' },
  textDarkened: { color: '#047857', fontWeight: '700' },
  unreadCounterBadge: { backgroundColor: '#34C759', minWidth: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  chatHeader: { flexDirection: 'row', height: 60, alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#fff' },
  headerBackButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  headerTitleText: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#1E293B' },
  messagesScrollList: { padding: 16, paddingBottom: 24 },
  bubbleWrapper: { flexDirection: 'row', marginBottom: 10, width: '100%' },
  bubbleMine: { justifyContent: 'flex-end' },
  bubbleTheirs: { justifyContent: 'flex-start' },
  bubbleContainer: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, maxWidth: '75%' },
  containerMine: { backgroundColor: '#34C759', borderBottomRightRadius: 4 },
  containerTheirs: { backgroundColor: '#F1F5F9', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  textMine: { color: '#fff' },
  textTheirs: { color: '#334155' },
  bubbleStatusMetaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4, minWidth: 45 },
  timestampText: { fontSize: 10, fontWeight: '600' },
  timestampMine: { color: '#D1FAE5' },
  timestampTheirs: { color: '#94A3B8' },
  inputDockContainer: { flexDirection: 'row', padding: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', alignItems: 'center', backgroundColor: '#fff', paddingBottom: Platform.OS === 'android' ? 28 : 12 },
  chatInputField: { flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 80, color: '#334155', fontWeight: '500' },
  sendActionButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#34C759', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  emptyInboxLayout: { alignItems: 'center', marginTop: 120 },
  emptyInboxText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 12 }
});
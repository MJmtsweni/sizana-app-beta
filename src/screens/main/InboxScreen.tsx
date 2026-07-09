import React, { useEffect, useState, useRef } from 'react';
import { 
  StyleSheet, Text, View, FlatList, TextInput, 
  TouchableOpacity, KeyboardAvoidingView, Platform, 
  ActivityIndicator, Image, Alert 
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

export default function InboxScreen({ route, navigation, session: directSession }: any) {
  // Session can arrive from multiple navigation paths
  const session = route?.params?.session || directSession || route?.params?.params?.session;

  // Normalise params — flatten nested params if present
  const rawParams = route?.params?.params || route?.params;

  // A direct chat is opened when sellerId is present in params
  const incomingChat = rawParams?.sellerId ? rawParams : null;

  const [messages, setMessages] = useState<any[]>([]);
  const [activeChatPartner, setActiveChatPartner] = useState<string | null>(null);
  const [activeChatName, setActiveChatName] = useState<string>('Messages');
  const [activeChatAvatar, setActiveChatAvatar] = useState<string | null>(null);
  // activeItemId is stored as item_id on messages — used for business context
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  // activeBusinessId is used to scope messages to a specific business (when present)
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [activeChatContext, setActiveChatContext] = useState<string | null>(null);

  const [conversations, setConversations] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const flatListRef = useRef<FlatList>(null);

  // ─── Entry point: open a direct chat or show the inbox list ───────────────
  useEffect(() => {
    if (incomingChat?.sellerId) {
      const sellerId: string = incomingChat.sellerId;
      // Guard: don't proceed with an undefined/null uuid
      if (!sellerId || sellerId === 'undefined') {
        fetchConversationsSummary();
        return;
      }

      const isMarketplace = !!incomingChat.itemTitle && !incomingChat.businessName;

      setActiveChatPartner(sellerId);
      setActiveChatName(incomingChat.sellerName || 'Member');
      setActiveChatAvatar(incomingChat.sellerAvatar || null);
      setActiveItemId(incomingChat.itemId || null);
      setActiveBusinessId(incomingChat.businessId || null);
      setActiveChatContext(incomingChat.businessName || incomingChat.itemTitle || null);

      // Pre-fill only for marketplace listings
      if (isMarketplace && incomingChat.itemTitle) {
        setNewMessage(`Hi, is "${incomingChat.itemTitle}" still available?`);
      }

      fetchChatMessages(sellerId, incomingChat.itemId || null);
      markMessagesAsRead(sellerId, incomingChat.itemId || null);
    } else {
      fetchConversationsSummary();
    }
  }, [route?.params]);

  // ─── Realtime: active chat window ─────────────────────────────────────────
  useEffect(() => {
    if (!session?.user?.id || !activeChatPartner) return;

    const chatChannel = supabase
      .channel(`chat-room-${session.user.id}-${activeChatPartner}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: any) => {
          const incoming = payload.new;
          const isFromPartner =
            incoming.sender_id === activeChatPartner &&
            incoming.receiver_id === session.user.id;
          const isFromMe =
            incoming.sender_id === session.user.id &&
            incoming.receiver_id === activeChatPartner;

          if (isFromPartner || isFromMe) {
            setMessages((prev) => {
              const alreadyExists = prev.some(m => m.id === incoming.id);
              if (alreadyExists) return prev;
              // Swap out the optimistic temp message
              const filtered = prev.filter(m => !String(m.id).startsWith('temp-'));
              return [...filtered, incoming];
            });
            if (isFromPartner) markMessagesAsRead(activeChatPartner, incoming.item_id || null);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(chatChannel); };
  }, [activeChatPartner, session?.user?.id]);

  // ─── Realtime: inbox list — update on new inbound messages ────────────────
  useEffect(() => {
    if (!session?.user?.id || activeChatPartner) return;

    const listChannel = supabase
      .channel(`inbox-list-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${session.user.id}`,
        },
        () => { fetchConversationsSummary(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(listChannel); };
  }, [session?.user?.id, activeChatPartner]);


  // ─── Mark messages as read ────────────────────────────────────────────────
  async function markMessagesAsRead(partnerId: string, itemId: string | null = null) {
  if (!session?.user?.id || !partnerId) return;
  try {
    let query = supabase
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', session.user.id)
      .eq('sender_id', partnerId)
      .eq('is_read', false);

    query = itemId ? query.eq('item_id', itemId) : query.is('item_id', null);

    const { error } = await query;
    if (error) throw error;
    fetchConversationsSummary();
  } catch (e: any) {
    console.error('Read update error:', e.message);
  }
}

  // ─── Fetch conversation list ──────────────────────────────────────────────
  // NOTE: we do NOT join on item_id → businesses because there is no FK in the
  // schema. Instead we collect unique item_ids and do a separate lookup.
  async function fetchConversationsSummary() {
    try {
      setLoading(true);
      if (!session?.user?.id) return;

      // Step 1: fetch all messages for this user — no business join
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          created_at,
          sender_id,
          receiver_id,
          is_read,
          item_id,
          business_id,
          sender:sender_id ( id, username, avatar_url ),
          receiver:receiver_id ( id, username, avatar_url )
        `)
        .or(`sender_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data) return;

      // Step 2: collect unique non-null business_ids so we can look up business names.
      // NOTE: business_id and item_id are separate columns — item_id is used for
      // marketplace listings and has no FK, business_id points at a real business.
      const businessIds = [
        ...new Set(
          data
            .map((m: any) => m.business_id)
            .filter((id: any) => id && id !== 'null')
        ),
      ] as string[];

      // Step 3: fetch business name + logo for those ids (single query, no FK needed)
      let businessMap: Record<string, { name: string; logo_url: string | null }> = {};
      if (businessIds.length > 0) {
        const { data: bizData } = await supabase
          .from('businesses')
          .select('id, name, logo_url')
          .in('id', businessIds);

        if (bizData) {
          bizData.forEach((b: any) => {
            businessMap[b.id] = { name: b.name, logo_url: b.logo_url };
          });
        }
      }

      // Step 4: build one entry per unique (partnerId + item_id) thread.
      // This keeps personal DMs, business chats, and marketplace threads separate
      // even when they involve the same person.
      const uniqueChats: Record<string, any> = {};

      data.forEach((msg: any) => {
        const isOutbound = msg.sender_id === session.user.id;
        const partnerId = isOutbound ? msg.receiver_id : msg.sender_id;
        const partnerProfile = isOutbound ? msg.receiver : msg.sender;
        const isUnreadInbound = !isOutbound && !msg.is_read;
        const biz = msg.business_id ? businessMap[msg.business_id] : null;

        // Composite key: group by partner AND context (business/item or personal)
        const threadKey = `${partnerId}::${msg.business_id || msg.item_id || 'personal'}`;

        if (!uniqueChats[threadKey]) {
          uniqueChats[threadKey] = {
            threadKey,
            id: msg.id,
            lastMessage: msg.content,
            lastMessageIsOutbound: isOutbound,
            timestamp: msg.created_at,
            partnerId,
            // Show business name as the card title when there's a business context,
            // otherwise fall back to the person's username
            partnerName: biz?.name || partnerProfile?.username || 'Sizana Member',
            partnerAvatar: biz?.logo_url || partnerProfile?.avatar_url || null,
            businessName: biz?.name || null,
            businessLogo: biz?.logo_url || null,
            // Keep these separate — itemId is a market_items id (no FK),
            // businessId is a real businesses id (has FK). Never conflate them.
            itemId: msg.item_id || null,
            businessId: msg.business_id || null,
            threadLabel: biz?.name
              ? `Business: ${biz.name}`
              : msg.item_id
              ? 'Marketplace'
              : null,
            unreadCount: isUnreadInbound ? 1 : 0,
          };
        } else {
          if (isUnreadInbound) uniqueChats[threadKey].unreadCount += 1;
        }
      });

      const sorted = Object.values(uniqueChats).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setConversations(sorted);
    } catch (error: any) {
      console.error('Error fetching conversations:', error.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Fetch messages for an open chat ─────────────────────────────────────
  async function fetchChatMessages(partnerId: string, itemId: string | null = null) {
    if (!partnerId || partnerId === 'undefined' || !session?.user?.id) {
      console.warn('fetchChatMessages called with invalid partnerId:', partnerId);
      return;
    }
    try {
      setLoading(true);

      let query = supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${session.user.id},receiver_id.eq.${partnerId}),` +
          `and(sender_id.eq.${partnerId},receiver_id.eq.${session.user.id})`
        )
        .order('created_at', { ascending: true });

      // Scope to the specific thread:
      // - business/marketplace thread: filter by item_id
      // - personal thread: only messages where item_id IS NULL
      if (itemId) {
        query = query.eq('item_id', itemId);
      } else {
        query = query.is('item_id', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (data) {
        setMessages(data);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
      }
    } catch (error: any) {
      console.error('fetchChatMessages error:', error.message);
      Alert.alert('Error loading messages', error.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Send a message ───────────────────────────────────────────────────────
  async function handleSendMessage() {
    if (!newMessage.trim() || !activeChatPartner || !session?.user?.id) return;

    const messageContent = newMessage.trim();
    setNewMessage('');

    const tempId = `temp-${Date.now()}`;
    const localMsg = {
      id: tempId,
      created_at: new Date().toISOString(),
      sender_id: session.user.id,
      receiver_id: activeChatPartner,
      item_id: activeItemId,
      content: messageContent,
      is_read: false,
    };

    setMessages((prev) => [...prev, localMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const insertPayload: any = {
        sender_id: session.user.id,
        receiver_id: activeChatPartner,
        content: messageContent,
      };
      
      // Use your active state variables directly
      if (activeItemId && activeItemId !== 'undefined') insertPayload.item_id = activeItemId;
      if (activeBusinessId && activeBusinessId !== 'undefined') insertPayload.business_id = activeBusinessId;

      // Add .select() to immediately return the saved row, then replace the temp message
      const { data, error } = await supabase
        .from('messages')
        .insert(insertPayload)
        .select('*, business:business_id(name, logo_url)')
        .single();

      if (error) throw error;

      // Instantly swap the temp clock message for the real database message
      setMessages((prev) => prev.map(m => m.id === tempId ? data : m));

      // Notify the receiver of a new message
const { error: notifError } = await supabase.from('notifications').insert({
  actor_id: session.user.id,
  receiver_id: activeChatPartner,
  type: 'message',
  target_id: activeItemId || null,
  is_read: false,
});
if (notifError) console.error('Message notification error:', notifError.message);
      
    } catch (error: any) {
      setMessages((prev) => prev.filter(m => m.id !== tempId));
      setNewMessage(messageContent);
      Alert.alert('Send Error', error.message);
    }
  }

  // ─── Delete a message ─────────────────────────────────────────────────────
  const handleDeleteMessage = (messageId: string) => {
    // Temp messages haven't been committed to the DB yet — just remove locally
    if (String(messageId).startsWith('temp-')) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      return;
    }

    Alert.alert(
      'Delete Message',
      'This will remove the message for everyone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic removal
            setMessages(prev => prev.filter(m => m.id !== messageId));
            try {
              const { error } = await supabase
                .from('messages')
                .delete()
                .eq('id', messageId)
                .eq('sender_id', session.user.id); // extra safety — only own messages

              if (error) throw error;
              // Refresh the conversation list so the preview updates
              fetchConversationsSummary();
            } catch (e: any) {
              Alert.alert('Delete Failed', e.message);
              // Re-fetch to restore the message if delete failed
              fetchChatMessages(activeChatPartner!, activeItemId);
            }
          },
        },
      ]
    );
  };
  const handleOpenConversation = async (item: any) => {
    await markMessagesAsRead(item.partnerId, item.itemId || null);
    setActiveChatPartner(item.partnerId);
    setActiveChatName(item.partnerName);       // already set to biz name when relevant
    setActiveChatAvatar(item.partnerAvatar);   // already set to biz logo when relevant
    setActiveItemId(item.itemId || null);
    setActiveBusinessId(item.businessId || null);
    setActiveChatContext(item.threadLabel || null);
    fetchChatMessages(item.partnerId, item.itemId || null);
  };

  // ─── Back to inbox list ───────────────────────────────────────────────────
  const handleBackToList = () => {
    setActiveChatPartner(null);
    setActiveChatName('Messages');
    setActiveChatAvatar(null);
    setActiveChatContext(null);
    setActiveItemId(null);
    setActiveBusinessId(null);
    setMessages([]);
    setNewMessage('');
    fetchConversationsSummary();
  };

  // ─── Delete an entire thread ──────────────────────────────────────────────
  // "Delete for me" model — removes all messages in this thread where the
  // current user is either sender or receiver. The other party is unaffected.
  const handleDeleteThread = (
    partnerId: string,
    itemId: string | null,
    displayName: string,
    onSuccess?: () => void
  ) => {
    Alert.alert(
      'Delete Conversation',
      `Remove your entire chat with "${displayName}"? This only affects your inbox.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistically remove from local list immediately
            setConversations(prev =>
              prev.filter(c => !(c.partnerId === partnerId && (c.businessId || null) === itemId))
            );

            try {
              // Build the base filter — all messages between these two users
              const sentFilter = `sender_id.eq.${session.user.id},receiver_id.eq.${partnerId}`;
              const receivedFilter = `sender_id.eq.${partnerId},receiver_id.eq.${session.user.id}`;

              let query = supabase
                .from('messages')
                .delete()
                .or(`${sentFilter},${receivedFilter}`);

              // Scope to the specific thread (business / marketplace / personal)
              if (itemId) {
                query = query.eq('item_id', itemId);
              } else {
                query = query.is('item_id', null);
              }

              const { error } = await query;
              if (error) throw error;

              onSuccess?.();
            } catch (e: any) {
              Alert.alert('Delete Failed', e.message);
              // Restore the list on failure
              fetchConversationsSummary();
            }
          },
        },
      ]
    );
  };
  const formatTimestamp = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
  };

  // ─── Format Timestamp for Chat Bubbles ────────────────────────────────────
  const formatBubbleTimestamp = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();

    const isToday = date.getDate() === now.getDate() &&
                    date.getMonth() === now.getMonth() &&
                    date.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() &&
                        date.getMonth() === yesterday.getMonth() &&
                        date.getFullYear() === yesterday.getFullYear();

    const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    const timeString = date.toLocaleTimeString('en-ZA', timeOptions);

    if (isToday) {
      return timeString;
    } else if (isYesterday) {
      return `Yesterday ${timeString}`;
    } else {
      const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
      // Append the year only if the message is from a previous year
      if (date.getFullYear() !== now.getFullYear()) {
        dateOptions.year = 'numeric';
      }
      const dateString = date.toLocaleDateString('en-ZA', dateOptions);
      return `${dateString} ${timeString}`;
    }
  };

  // ─── Render: conversation card ────────────────────────────────────────────
  const renderConversationItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.convoCard, item.unreadCount > 0 && styles.convoCardUnread]}
      onPress={() => handleOpenConversation(item)}
      onLongPress={() =>
        handleDeleteThread(
          item.partnerId,
          item.businessId || null,
          item.partnerName,
        )
      }
      delayLongPress={450}
      activeOpacity={0.75}
    >
      <View style={styles.avatarFrame}>
        {item.businessLogo ? (
          <Image source={{ uri: item.businessLogo }} style={styles.avatarImg} />
        ) : item.partnerAvatar ? (
          <Image source={{ uri: item.partnerAvatar }} style={styles.avatarImg} />
        ) : (
          <Ionicons name="person-circle" size={48} color="#CBD5E1" />
        )}
      </View>

      <View style={styles.convoDetails}>
        <View style={styles.convoTopRow}>
          <Text
            style={[styles.partnerNameText, item.unreadCount > 0 && styles.textBolded]}
            numberOfLines={1}
          >
            {item.partnerName}
          </Text>
          <Text style={styles.timestampSmall}>{formatTimestamp(item.timestamp)}</Text>
        </View>

        {item.threadLabel && (
          <View style={[
            styles.bizTag,
            item.threadLabel.startsWith('Marketplace') && styles.bizTagMarketplace
          ]}>
            <Ionicons
              name={item.threadLabel.startsWith('Business') ? 'briefcase-outline' : 'pricetag-outline'}
              size={10}
              color={item.threadLabel.startsWith('Business') ? '#3B82F6' : '#F59E0B'}
            />
            <Text style={[
              styles.bizTagText,
              item.threadLabel.startsWith('Marketplace') && styles.bizTagTextMarketplace
            ]}>
              {item.threadLabel}
            </Text>
          </View>
        )}

        <View style={styles.previewRow}>
          {item.lastMessageIsOutbound && <Text style={styles.youLabel}>You: </Text>}
          <Text
            style={[styles.lastMessageText, item.unreadCount > 0 && styles.textDarkened]}
            numberOfLines={1}
          >
            {item.lastMessage}
          </Text>
        </View>
      </View>

      {item.unreadCount > 0 ? (
        <View style={styles.unreadCounterBadge}>
          <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
      )}
    </TouchableOpacity>
  );

  // ─── Render: chat bubble ──────────────────────────────────────────────────
  const renderMessageBubble = ({ item }: { item: any }) => {
    const isMine = item.sender_id === session?.user?.id;
    const isTemp = String(item.id).startsWith('temp-');

    const bubble = (
      <View style={[styles.bubbleContainer, isMine ? styles.containerMine : styles.containerTheirs]}>
        <Text style={[styles.bubbleText, isMine ? styles.textMine : styles.textTheirs]}>
          {item.content}
        </Text>
        <View style={styles.bubbleStatusMetaRow}>
  <Text 
    numberOfLines={1} // CRITICAL FIX: Forces the date to stay on a single line
    style={[styles.timestampText, isMine ? styles.timestampMine : styles.timestampTheirs]}
  >
    {formatBubbleTimestamp(item.created_at)}
  </Text>
  {isMine && (
    <Ionicons
      name={isTemp ? "time-outline" : item.is_read ? "checkmark-done" : "checkmark"}
      size={14}
      color={item.is_read ? "#6EE7B7" : "#E2E8F0"}
      style={{ marginLeft: 2 }} 
    />
  )}
</View>
      </View>
    );

    return (
      <View style={[styles.bubbleWrapper, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {isMine ? (
          // Long-press to delete — only on own messages
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={() => handleDeleteMessage(item.id)}
            delayLongPress={400}
          >
            {bubble}
          </TouchableOpacity>
        ) : (
          // Received messages are not interactive
          bubble
        )}
      </View>
    );
  };

  // =========================================================
  // CHAT WINDOW VIEW
  // =========================================================
  if (activeChatPartner) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 25}
        style={styles.chatWindow}
      >
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={handleBackToList} style={styles.headerBackButton}>
            <Ionicons name="arrow-back" size={22} color="#1E293B" />
          </TouchableOpacity>

          <View style={styles.chatHeaderCenter}>
            <View style={styles.chatHeaderAvatarFrame}>
              {activeChatAvatar ? (
                <Image source={{ uri: activeChatAvatar }} style={styles.chatHeaderAvatar} />
              ) : (
                <Ionicons name="person-circle" size={36} color="#CBD5E1" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitleText} numberOfLines={1}>{activeChatName}</Text>
              {activeChatContext && (
                <Text style={styles.headerSubtitleText} numberOfLines={1}>
                  {activeChatContext}
                </Text>
              )}
            </View>
          </View>

          <View style={{ width: 36, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() =>
                handleDeleteThread(
                  activeChatPartner!,
                  activeItemId,
                  activeChatName,
                  handleBackToList  // go back to inbox list after deletion
                )
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#34C759" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            renderItem={renderMessageBubble}
            contentContainerStyle={styles.messagesScrollList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubbles-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyChatText}>Start the conversation!</Text>
              </View>
            }
          />
        )}

        <View style={styles.inputDockContainer}>
          <TextInput
            style={styles.chatInputField}
            placeholder="Type a message..."
            placeholderTextColor="#94A3B8"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendActionButton, !newMessage.trim() && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!newMessage.trim()}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // =========================================================
  // CONVERSATIONS LIST VIEW
  // =========================================================
  return (
    <View style={styles.mainContainer}>
      <View style={styles.inboxTitleBlock}>
        <Text style={styles.mainInboxTitle}>Inbox</Text>
        {conversations.length > 0 && (
          <Text style={styles.inboxSubtitle}>
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#34C759" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.threadKey}
          renderItem={renderConversationItem}
          contentContainerStyle={conversations.length === 0 ? { flex: 1 } : { padding: 16 }}
          showsVerticalScrollIndicator={false}
          onRefresh={fetchConversationsSummary}
          refreshing={loading}
          ListEmptyComponent={
            <View style={styles.emptyInboxLayout}>
              <Ionicons name="mail-outline" size={60} color="#CBD5E1" />
              <Text style={styles.emptyInboxText}>No messages yet.</Text>
              <Text style={styles.emptyInboxSubText}>
                Messages from traders and businesses will appear here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  chatWindow: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  inboxTitleBlock: {
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 45,
    paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  mainInboxTitle: { fontSize: 26, fontWeight: '800', color: '#1E293B' },
  inboxSubtitle: { fontSize: 13, color: '#94A3B8', fontWeight: '500', marginTop: 2 },
  convoCard: {
    flexDirection: 'row', backgroundColor: '#fff', padding: 14,
    borderRadius: 16, alignItems: 'center', marginBottom: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  convoCardUnread: { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' },
  avatarFrame: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#F1F5F9', overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarImg: { width: '100%', height: '100%' },
  convoDetails: { flex: 1, minWidth: 0 },
  convoTopRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 2,
  },
  partnerNameText: { fontSize: 15, fontWeight: '700', color: '#1E293B', flex: 1, marginRight: 8 },
  timestampSmall: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  bizTag: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, alignSelf: 'flex-start', marginBottom: 4,
  },
  bizTagText: { fontSize: 10, fontWeight: '700', color: '#3B82F6', marginLeft: 4 },
  bizTagMarketplace: { backgroundColor: '#FFFBEB' },
  bizTagTextMarketplace: { color: '#F59E0B' },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  youLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  lastMessageText: { fontSize: 13, color: '#64748B', fontWeight: '500', flex: 1 },
  textBolded: { fontWeight: '800', color: '#065F46' },
  textDarkened: { color: '#047857', fontWeight: '700' },
  unreadCounterBadge: {
    backgroundColor: '#34C759', minWidth: 22, height: 22,
    borderRadius: 11, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 6, marginLeft: 8,
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  emptyInboxLayout: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyInboxText: { color: '#334155', fontSize: 16, fontWeight: '700', marginTop: 16 },
  emptyInboxSubText: {
    color: '#94A3B8', fontSize: 13, fontWeight: '500', marginTop: 6, textAlign: 'center',
  },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingBottom: 12,
    paddingTop: Platform.OS === 'ios' ? 60 : 45,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#fff',
  },
  headerBackButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  chatHeaderCenter: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  chatHeaderAvatarFrame: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F1F5F9', overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  chatHeaderAvatar: { width: '100%', height: '100%' },
  headerTitleText: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  headerSubtitleText: { fontSize: 11, color: '#64748B', fontWeight: '500', marginTop: 1 },
  messagesScrollList: { padding: 16, paddingBottom: 24 },
  emptyChat: { alignItems: 'center', marginTop: 80 },
  emptyChatText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 12 },
  bubbleWrapper: { flexDirection: 'row', marginBottom: 10, width: '100%' },
  bubbleMine: { justifyContent: 'flex-end' },
  bubbleTheirs: { justifyContent: 'flex-start' },
  bubbleContainer: { 
    paddingHorizontal: 14, 
    paddingTop: 8, 
    paddingBottom: 6, 
    borderRadius: 18, 
    maxWidth: '82%', 
    minWidth: 90, 
  },
  containerMine: { backgroundColor: '#34C759', borderBottomRightRadius: 4 },
  containerTheirs: {
    backgroundColor: '#fff', borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  bubbleText: { 
    fontSize: 15, 
    lineHeight: 22, 
    fontWeight: '500' 
  },
  textMine: { color: '#fff' },
  textTheirs: { color: '#334155' },
  bubbleStatusMetaRow: { 
    flexDirection: 'row', 
    justifyContent: 'flex-end', 
    alignItems: 'center', 
    marginTop: 4, 
    width: '100%', 
  },
  timestampText: { fontSize: 10, fontWeight: '600', flexShrink: 0, },
  timestampMine: { color: '#D1FAE5' },
  timestampTheirs: { color: '#94A3B8' },
  inputDockContainer: {
    flexDirection: 'row', padding: 12, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: '#E2E8F0',
    alignItems: 'flex-end', backgroundColor: '#fff',
    paddingBottom: Platform.OS === 'android' ? 28 : 12,
  },
  chatInputField: {
    flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1,
    borderColor: '#E2E8F0', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, maxHeight: 100, color: '#334155', fontWeight: '500',
  },
  sendActionButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#34C759', justifyContent: 'center',
    alignItems: 'center', marginLeft: 10,
  },
  sendButtonDisabled: { backgroundColor: '#CBD5E1' },
});

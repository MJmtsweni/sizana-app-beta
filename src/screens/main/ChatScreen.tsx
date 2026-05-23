import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, 
  KeyboardAvoidingView, Platform, ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChatScreen({ route, navigation }: any) {
  const { session, recipientId, recipientName } = route.params;
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
  }, []);

  async function fetchMessages() {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${session.user.id},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${session.user.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data) setMessages(data);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }

  async function handleSend() {
    if (!inputText.trim()) return;

    const newMessage = {
      sender_id: session.user.id,
      receiver_id: recipientId,
      content: inputText.trim(),
    };

    // Optimistic UI update for instant feedback
    setMessages(prev => [...prev, { ...newMessage, id: Date.now().toString(), created_at: new Date().toISOString() }]);
    setInputText('');
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    // Database Insert
    await supabase.from('messages').insert([newMessage]);
  }

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.sender_id === session.user.id;
    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
          {item.content}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 45) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{recipientName || 'Chat'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color="#3B82F6" /></View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  
  messageBubble: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, marginBottom: 12 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#3B82F6', borderBottomRightRadius: 4 },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#E2E8F0', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
  myMessageText: { color: '#fff' },
  theirMessageText: { color: '#1E293B' },

  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#fff', padding: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  textInput: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: '#1E293B', maxHeight: 100 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', marginLeft: 12, marginBottom: 2 }
});
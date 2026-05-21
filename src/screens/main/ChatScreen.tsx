import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { chatService } from '../../lib/chatService';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

// Define the type for your navigation params
type RootStackParamList = {
  Chat: { receiverId: string; receiverName: string };
};

export default function ChatScreen({ route }: any) {
  // receiverId comes from the navigation (e.g., clicking a user profile)
  const { receiverId, receiverName } = route.params;
  
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const flatListRef = useRef<FlatList>(null);

useEffect(() => {
  let channel: any;

  const startChat = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        
        // Fetch initial history
        const history = await chatService.getConversation(receiverId);
        setMessages(history);

        // --- Set up Realtime Subscription INSIDE the user check ---
        channel = supabase
          .channel(`chat-${receiverId}`)
          .on('postgres_changes', 
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'direct_messages' 
            }, 
            (payload) => {
              const msg = payload.new;
              // Validate the "Packet" belongs to this specific connection
              if (
                (msg.sender_id === receiverId && msg.receiver_id === user.id) ||
                (msg.sender_id === user.id && msg.receiver_id === receiverId)
              ) {
                setMessages((prev) => [...prev, msg]);
              }
            }
          )
          .subscribe();
      }
    } catch (error) {
      console.error("Connection Error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (receiverId) {
    startChat();
  }

  // "Teardown" the connection when the component unmounts
  return () => {
    if (channel) {
      supabase.removeChannel(channel);
    }
  };
}, [receiverId]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const tempText = inputText;
    setInputText(''); // Clear input immediately for better UX
    
    try {
      await chatService.sendMessage(receiverId, tempText);
    } catch (error: any) {
      console.error("Send failed:", error.message);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 25}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{receiverName || "Conversation"}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[
            styles.bubble, 
            item.sender_id === currentUserId ? styles.myMessage : styles.theirMessage
          ]}>
            <Text style={item.sender_id === currentUserId ? styles.myText : styles.theirText}>
              {item.content}
            </Text>
            <View style={styles.statusRow}>
      <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      {item.sender_id === currentUserId && (
        <Text style={styles.checkMark}>{item.is_read ? ' ✓✓' : ' ✓'}</Text>
      )}
    </View>
          </View>
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ paddingVertical: 10 }}
      />

      <View style={styles.inputArea}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message..."
          multiline
        />
        <TouchableOpacity style={styles.sendIcon} onPress={handleSend}>
          <Text style={styles.sendLabel}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    padding: 15, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderColor: '#eee', 
    alignItems: 'center' 
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  bubble: { 
    padding: 12, 
    borderRadius: 18, 
    marginVertical: 4, 
    marginHorizontal: 12, 
    maxWidth: '75%' 
  },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#007AFF' },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#E9E9EB' },
  
  // MERGED myText - No more duplicates
  myText: { color: '#fff', fontSize: 16 }, 
  theirText: { color: '#000', fontSize: 16 },

  statusRow: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    marginTop: 4,
    alignItems: 'center',
  },
  timestamp: {
    fontSize: 10,
    // Using a lighter color for the sender's bubble (white-ish)
    // and a darker one for the receiver's bubble
  },
  checkMark: {
    fontSize: 10,
    color: '#fff',
    marginLeft: 3,
  },
  inputArea: { 
    flexDirection: 'row', 
    padding: 10, 
    paddingBottom: Platform.OS === 'android' ? 25 : 10,
    backgroundColor: '#fff', 
    borderTopWidth: 1, 
    borderColor: '#eee' 
  },
  textInput: { 
    flex: 1, 
    backgroundColor: '#F1F3F5', 
    borderRadius: 20, 
    paddingHorizontal: 15, 
    paddingVertical: 8, 
    fontSize: 16, 
    maxHeight: 100 
  },
  sendIcon: { marginLeft: 10, justifyContent: 'center', paddingHorizontal: 5 },
  sendLabel: { color: '#007AFF', fontWeight: 'bold', fontSize: 16 }
});
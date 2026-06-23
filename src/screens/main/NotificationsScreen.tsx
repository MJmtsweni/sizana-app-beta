import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  Platform, ActivityIndicator, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

export default function NotificationsScreen({ navigation, route }: any) {
  const session = route?.params?.session;
  
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [])
  );

  const handleClearAll = async () => {
    Alert.alert("Clear Activity", "Are you sure you want to delete all notifications?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Clear All", 
        style: "destructive", 
        onPress: async () => {
          // 1. Optional UX: Set loading state here if you have one for the whole screen
          try {
            const { data, error } = await supabase
              .from('notifications')
              .delete()
              .eq('receiver_id', session.user.id)
              .select(); // <-- Crucial: Forces Supabase to return the deleted rows

            // 2. Explicitly throw the Supabase error so the catch block triggers
            if (error) throw error;

            // 3. Check for silent RLS failures
            if (!data || data.length === 0) {
               // If there were notifications on screen, but the DB deleted 0 rows, it failed.
               if (notifications.length > 0) {
                 Alert.alert("Delete Failed", "The database blocked the deletion. Please check your permissions.");
                 fetchNotifications(); // Refresh the screen to restore the true database state
                 return;
               }
            }

            // 4. If we reach here, the database successfully wiped the rows!
            setNotifications([]);
            
          } catch (error: any) {
            Alert.alert("Error clearing notifications", error.message);
            fetchNotifications(); // Restore the UI if the network dropped
          }
        }
      }
    ]);
  };
  async function fetchNotifications() {
    if (!session?.user?.id) return;
    try {
      if (!refreshing) setLoading(true);
      
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          actor:actor_id ( username, avatar_url )
        `)
        .eq('receiver_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setNotifications(data);
    } catch (e: any) {
      console.error("Notifications fetch error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Handle clicking a notification: Mark as read, fetch the post, and route to Thread
  async function handleOpenNotification(item: any) {
    try {
      // 1. Optimistic UI update to remove the "unread" styling instantly
      if (!item.is_read) {
        setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
        await supabase.from('notifications').update({ is_read: true }).eq('id', item.id);
      }

      // 2. Fetch the target post data needed for the ThreadScreen
      const { data: postData, error } = await supabase
        .from('forum_posts')
        .select(`*, author:author_id(username, avatar_url)`)
        .eq('id', item.target_id)
        .single();

      if (error) throw error;

      // 3. Navigate to the Thread
      if (postData) {
        navigation.navigate('Thread', { post: postData, session: session });
      }
    } catch (e: any) {
      Alert.alert('Content Unavailable', 'This post may have been deleted.');
    }
  }

  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
  };

  const renderNotificationItem = ({ item }: { item: any }) => {
    const isLike = item.type === 'like';
    const actorName = item.actor?.username || 'Someone';

    return (
      <TouchableOpacity 
        style={[styles.notificationCard, !item.is_read && styles.unreadCard]} 
        activeOpacity={0.8}
        onPress={() => handleOpenNotification(item)}
      >
        <View style={styles.avatarWrapper}>
          {item.actor?.avatar_url ? (
            <Image source={{ uri: item.actor.avatar_url }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person-circle" size={44} color="#CBD5E1" />
          )}
          
          {/* 1. ADD pointerEvents HERE */}
          <View 
            style={[styles.actionBadge, isLike ? { backgroundColor: '#EF4444' } : { backgroundColor: '#3B82F6' }]}
            pointerEvents="none" 
          >
            <Ionicons name={isLike ? "heart" : "chatbubble"} size={10} color="#fff" />
          </View>
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.messageText}>
            <Text style={styles.boldText}>{actorName}</Text> 
            {isLike ? ' liked your post.' : ' commented on a discussion.'}
          </Text>
          <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
        </View>

        {/* 2. ADD pointerEvents HERE */}
        {!item.is_read && <View style={styles.unreadDot} pointerEvents="none" />}
        
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.mainContainer}>
      {/* HEADER */}
      <View style={[styles.navPanel, { zIndex: 10, elevation: 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Activity Center</Text>
      <TouchableOpacity onPress={handleClearAll} style={{ padding: 8, zIndex: 11 }}>
          <Ionicons name="trash-outline" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* NOTIFICATIONS LIST */}
      {loading && !refreshing ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#34C759" /></View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotificationItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          onRefresh={() => { setRefreshing(true); fetchNotifications(); }}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyLayout}>
              <Ionicons name="notifications-off-outline" size={60} color="#CBD5E1" />
              <Text style={styles.emptyText}>You're all caught up! No new notifications.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  navPanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 60 : 45, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  navTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },

  notificationCard: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  unreadCard: { backgroundColor: '#F0FDF4' }, // Light green tint for unread
  
  avatarWrapper: { position: 'relative', marginRight: 12 },
  avatarImage: { width: 44, height: 44, borderRadius: 22 },
  actionBadge: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  
  textContainer: { flex: 1, justifyContent: 'center' },
  messageText: { fontSize: 14, color: '#334155', lineHeight: 20 },
  boldText: { fontWeight: '700', color: '#1E293B' },
  timeText: { fontSize: 12, color: '#94A3B8', marginTop: 4, fontWeight: '500' },
  
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759', marginLeft: 10 },
  
  emptyLayout: { alignItems: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 16, textAlign: 'center' }
});
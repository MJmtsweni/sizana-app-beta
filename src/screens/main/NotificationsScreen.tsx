import React, { useState, useCallback, useEffect } from 'react';
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

  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel('realtime-notifications')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications', 
        filter: `receiver_id=eq.${session.user.id}` 
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  const fetchNotifications = async () => {
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
  };

  const handleClearAll = async () => {
    Alert.alert("Clear Activity", "Are you sure you want to delete all notifications?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Clear All", 
        style: "destructive", 
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('notifications')
              .delete()
              .eq('receiver_id', session.user.id);

            if (error) throw error;
            setNotifications([]);
          } catch (error: any) {
            Alert.alert("Error", "Could not clear notifications: " + error.message);
          }
        }
      }
    ]);
  };

  const handleOpenNotification = async (item: any) => {
    try {
      // 1. Mark as read (optimistic)
      if (!item.is_read) {
        setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n));
        await supabase.from('notifications').update({ is_read: true }).eq('id', item.id);
      }

      // 2. Navigate based on type
      if (item.type === 'like' || item.type === 'comment') {
        // Navigate to the forum thread
        const { data: postData, error } = await supabase
          .from('forum_posts')
          .select(`*, author:author_id(username, avatar_url)`)
          .eq('id', item.target_id)
          .single();

        if (error) throw error;
        if (postData) {
          navigation.navigate('Thread', { post: postData, session });
        }
      } else if (item.type === 'follow') {
        // Fetch the business they followed to route them there
        const { data: bizData } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', item.target_id)
          .single();
          
        if (bizData) {
          navigation.navigate('BusinessProfile', { business: bizData, session });
        }
      } else if (item.type === 'message') {
        // Route them directly to their Inbox to see the new inquiry
        navigation.navigate('Inbox', { session });
  
      } else if (item.type === 'rsvp') {
        // Navigate to the event detail — target_id is event_id
        const { data: eventData, error } = await supabase
          .from('events')
          .select(`*, creator:creator_id(username, avatar_url), business:business_id(name, logo_url)`)
          .eq('id', item.target_id)
          .single();

        if (error) throw error;
        if (eventData) {
          navigation.navigate('EventDetail', { event: eventData, session });
        }
      }
    } catch (e: any) {
      Alert.alert('Content Unavailable', 'This content may have been deleted.');
    }
  };

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

  // Config map for all supported notification types
  const getTypeConfig = (type: string, actorName: string) => {
    switch (type) {
      case 'like':
        return {
          icon: 'heart' as const,
          badgeColor: '#EF4444',
          message: 'liked your post.',
        };
      case 'comment':
        return {
          icon: 'chatbubble' as const,
          badgeColor: '#3B82F6',
          message: 'commented on your discussion.',
        };
      case 'follow':
        return {
          icon: 'person-add' as const,
          badgeColor: '#8B5CF6',
          message: 'started following your business.',
        };
      case 'rsvp':
        return {
          icon: 'calendar' as const,
          badgeColor: '#F59E0B',
          message: 'is attending your event.',
        };
      case 'message':
        return {
          icon: 'chatbubble-ellipses' as const,
          badgeColor: '#34C759',
          message: 'sent a new business inquiry.',
        };  
      default:
        return {
          icon: 'notifications' as const,
          badgeColor: '#64748B',
          message: 'has new activity.',
        };
    }
  };

  const renderNotificationItem = ({ item }: { item: any }) => {
    const actorName = item.actor?.username || 'Someone';
    const config = getTypeConfig(item.type, actorName);

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
          
          <View 
            style={[styles.actionBadge, { backgroundColor: config.badgeColor }]}
            pointerEvents="none" 
          >
            <Ionicons name={config.icon} size={10} color="#fff" />
          </View>
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.messageText}>
            <Text style={styles.boldText}>{actorName}</Text>
            {' '}{config.message}
          </Text>
          <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
        </View>

        {!item.is_read && <View style={styles.unreadDot} pointerEvents="none" />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.navPanel, { zIndex: 10, elevation: 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Activity Center</Text>
        <TouchableOpacity onPress={handleClearAll} style={{ padding: 8 }}>
          <Ionicons name="trash-outline" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

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
  navPanel: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 60 : 45,
    paddingBottom: 15, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0'
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center'
  },
  navTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  notificationCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9'
  },
  unreadCard: { backgroundColor: '#F0FDF4' },
  avatarWrapper: { position: 'relative', marginRight: 12 },
  avatarImage: { width: 44, height: 44, borderRadius: 22 },
  actionBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff'
  },
  textContainer: { flex: 1, justifyContent: 'center' },
  messageText: { fontSize: 14, color: '#334155', lineHeight: 20 },
  boldText: { fontWeight: '700', color: '#1E293B' },
  timeText: { fontSize: 12, color: '#94A3B8', marginTop: 4, fontWeight: '500' },
  unreadDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#34C759', marginLeft: 10
  },
  emptyLayout: { alignItems: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 16, textAlign: 'center' }
});

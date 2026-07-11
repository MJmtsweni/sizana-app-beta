import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  ActivityIndicator, Alert, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

export default function FriendsScreen({ navigation, route }: any) {
  const session = route.params?.session;
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'Requests' | 'Friends'>('Requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchNetwork();
    }, [session?.user?.id])
  );

  async function fetchNetwork() {
    if (!session?.user?.id) return;
    try {
      setLoading(true);

      // 1. Fetch Incoming Pending Requests
      // We use (*) to ensure the complete profile is passed to PublicProfileScreen
      const { data: reqData, error: reqError } = await supabase
        .from('user_friends')
        .select(`
          id,
          created_at,
          sender:user_id_1 ( * ) 
        `)
        .eq('user_id_2', session.user.id)
        .eq('status', 'pending');

      if (reqError) throw reqError;
      if (reqData) setRequests(reqData);

      // 2. Fetch Accepted Friends
      // We use (*) for both users so whoever the friend is, their full data is loaded
      const { data: friendData, error: friendError } = await supabase
        .from('user_friends')
        .select(`
          id,
          user_id_1 ( * ),
          user_id_2 ( * )
        `)
        .eq('status', 'accepted')
        .or(`user_id_1.eq.${session.user.id},user_id_2.eq.${session.user.id}`);

      if (friendError) throw friendError;
      if (friendData) {
        // Map through to extract the *other* person's full profile
        const formattedFriends = friendData.map((row: any) => {
          const isUser1 = row.user_id_1.id === session.user.id;
          const friendProfile = isUser1 ? row.user_id_2 : row.user_id_1;
          return {
            id: row.id,
            profile: friendProfile
          };
        });
        setFriends(formattedFriends);
      }

    } catch (e: any) {
      console.error("Network fetch error:", e.message);
    } finally {
      setLoading(false);
    }
  }

  const handleAcceptRequest = async (requestId: string, senderId: string) => {
    try {
      setProcessingId(requestId);
      const { error } = await supabase
        .from('user_friends')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (error) throw error;

      // Notify the sender that their request was accepted
      await supabase.from('notifications').insert({
        actor_id: session.user.id,
        receiver_id: senderId,
        type: 'friend_accept',
        target_id: session.user.id,
        is_read: false,
      });

      fetchNetwork();
    } catch (e: any) {
      Alert.alert("Error", "Could not accept request.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      setProcessingId(requestId);
      const { error } = await supabase
        .from('user_friends')
        .delete()
        .eq('id', requestId);

      if (error) throw error;
      fetchNetwork();
    } catch (e: any) {
      Alert.alert("Error", "Could not decline request.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemoveFriend = (requestId: string, friendName: string) => {
    Alert.alert(
      "Remove Friend",
      `Are you sure you want to remove ${friendName} from your friends list?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive", 
          onPress: async () => {
            try {
              await supabase.from('user_friends').delete().eq('id', requestId);
              fetchNetwork();
            } catch (e) {
              Alert.alert("Error", "Could not remove friend.");
            }
          }
        }
      ]
    );
  };

  const handleProfilePress = (userProfile: any) => {
    if (!userProfile) return;
    navigation.navigate('PublicProfile', { userProfile, session });
  };

  const renderRequestCard = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <TouchableOpacity 
        style={styles.cardHeader} 
        activeOpacity={0.7} 
        onPress={() => handleProfilePress(item.sender)}
      >
        {item.sender?.avatar_url ? (
          <Image source={{ uri: item.sender.avatar_url }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person-circle" size={48} color="#CBD5E1" />
        )}
        <View style={styles.userInfo}>
          <Text style={styles.usernameText}>{item.sender?.username || 'Community Member'}</Text>
          {item.sender?.location ? (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={12} color="#94A3B8" />
              <Text style={styles.locationText}>{item.sender.location}</Text>
            </View>
          ) : (
            <Text style={styles.locationText}>Wants to connect</Text>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.actionRow}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.declineButton]} 
          onPress={() => handleDeclineRequest(item.id)}
          disabled={processingId === item.id}
        >
          <Text style={styles.declineButtonText}>Decline</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.acceptButton]} 
          onPress={() => handleAcceptRequest(item.id, item.sender.id)}
          disabled={processingId === item.id}
        >
          {processingId === item.id ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.acceptButtonText}>Accept</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFriendCard = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <TouchableOpacity 
        style={styles.cardHeader} 
        activeOpacity={0.7} 
        onPress={() => handleProfilePress(item.profile)}
      >
        {item.profile?.avatar_url ? (
          <Image source={{ uri: item.profile.avatar_url }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person-circle" size={48} color="#CBD5E1" />
        )}
        <View style={styles.userInfo}>
          <Text style={styles.usernameText}>{item.profile?.username || 'Community Member'}</Text>
          {item.profile?.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={12} color="#94A3B8" />
              <Text style={styles.locationText}>{item.profile.location}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.actionRow}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.declineButton, { flex: 0.5 }]} 
          onPress={() => handleRemoveFriend(item.id, item.profile?.username)}
        >
          <Ionicons name="person-remove" size={16} color="#475569" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', flex: 1.5 }]} 
          onPress={() => navigation.navigate('Inbox', { 
            session, 
            sellerId: item.profile.id, 
            sellerName: item.profile.username,
            sellerAvatar: item.profile.avatar_url
          })}
        >
          <Ionicons name="chatbubbles" size={16} color="#3B82F6" style={{ marginRight: 6 }} />
          <Text style={{ color: '#3B82F6', fontSize: 14, fontWeight: '700' }}>Message</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.navPanel, { paddingTop: Math.max(insets.top, 45) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Network</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'Requests' && styles.activeTab]} 
          onPress={() => setActiveTab('Requests')}
        >
          <Text style={[styles.tabText, activeTab === 'Requests' && styles.activeTabText]}>
            Requests {requests.length > 0 && `(${requests.length})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'Friends' && styles.activeTab]} 
          onPress={() => setActiveTab('Friends')}
        >
          <Text style={[styles.tabText, activeTab === 'Friends' && styles.activeTabText]}>
            My Friends {friends.length > 0 && `(${friends.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#34C759" /></View>
      ) : (
        <FlatList
          data={activeTab === 'Requests' ? requests : friends}
          keyExtractor={(item) => item.id}
          renderItem={activeTab === 'Requests' ? renderRequestCard : renderFriendCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons 
                name={activeTab === 'Requests' ? "mail-unread-outline" : "people-outline"} 
                size={60} 
                color="#CBD5E1" 
              />
              <Text style={styles.emptyStateText}>
                {activeTab === 'Requests' 
                  ? "You have no pending friend requests." 
                  : "You haven't added any friends yet."}
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navPanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  navTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#34C759' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  activeTabText: { color: '#34C759', fontWeight: '800' },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  userInfo: { marginLeft: 12, flex: 1 },
  usernameText: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationText: { fontSize: 13, color: '#64748B', marginLeft: 4, fontWeight: '500' },

  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, flexDirection: 'row', height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  acceptButton: { backgroundColor: '#34C759', borderColor: '#34C759' },
  acceptButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  declineButton: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  declineButtonText: { color: '#475569', fontSize: 14, fontWeight: '700' },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyStateText: { fontSize: 14, color: '#94A3B8', fontWeight: '500', marginTop: 12 }
});
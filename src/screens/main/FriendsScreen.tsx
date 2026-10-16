import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  ActivityIndicator, Alert, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { colors, fontFamily } from '../../theme';
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
          <Ionicons name="person-circle" size={48} color={colors.borderStrong} />
        )}
        <View style={styles.userInfo}>
          <Text style={styles.usernameText}>{item.sender?.username || 'Community Member'}</Text>
          {item.sender?.location ? (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={12} color={colors.textTertiary} />
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
            <ActivityIndicator color={colors.white} size="small" />
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
          <Ionicons name="person-circle" size={48} color={colors.borderStrong} />
        )}
        <View style={styles.userInfo}>
          <Text style={styles.usernameText}>{item.profile?.username || 'Community Member'}</Text>
          {item.profile?.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={12} color={colors.textTertiary} />
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
          <Ionicons name="person-remove" size={16} color={colors.slate[600]} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, { backgroundColor: colors.accentSubtle, borderColor: '#BFDBFE', flex: 1.5 }]} 
          onPress={() => navigation.navigate('Inbox', { 
            session, 
            sellerId: item.profile.id, 
            sellerName: item.profile.username,
            sellerAvatar: item.profile.avatar_url
          })}
        >
          <Ionicons name="chatbubbles" size={16} color={colors.accent} style={{ marginRight: 6 }} />
          <Text style={{ color: colors.accent, fontSize: 14, fontFamily: fontFamily.bold }}>Message</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.navPanel, { paddingTop: Math.max(insets.top, 45) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
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
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.brand} /></View>
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
                color={colors.borderStrong} 
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
  mainContainer: { flex: 1, backgroundColor: colors.backgroundMuted },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navPanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 15, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.slate[100], justifyContent: 'center', alignItems: 'center' },
  navTitle: { fontSize: 18, fontFamily: fontFamily.extrabold, color: colors.textPrimary },
  
  tabContainer: { flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.slate[100] },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: colors.brand },
  tabText: { fontSize: 14, fontFamily: fontFamily.semibold, color: colors.textTertiary },
  activeTabText: { color: colors.brand, fontFamily: fontFamily.extrabold },

  card: { backgroundColor: colors.white, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  userInfo: { marginLeft: 12, flex: 1 },
  usernameText: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationText: { fontSize: 13, color: colors.textSecondary, marginLeft: 4, fontFamily: fontFamily.medium },

  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, flexDirection: 'row', height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  acceptButton: { backgroundColor: colors.brand, borderColor: colors.brand },
  acceptButtonText: { color: colors.white, fontSize: 14, fontFamily: fontFamily.bold },
  declineButton: { backgroundColor: colors.backgroundMuted, borderColor: colors.border },
  declineButtonText: { color: colors.slate[600], fontSize: 14, fontFamily: fontFamily.bold },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyStateText: { fontSize: 14, color: colors.textTertiary, fontFamily: fontFamily.medium, marginTop: 12 }
});
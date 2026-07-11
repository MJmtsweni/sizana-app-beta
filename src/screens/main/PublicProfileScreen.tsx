import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Image, TouchableOpacity, FlatList, 
  ActivityIndicator, Alert, Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;

export default function PublicProfileScreen({ route, navigation }: any) {
  const { userProfile, session } = route.params;
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'Posts' | 'Listings'>('Posts');
  const [posts, setPosts] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Social Graph States
  const [isFollowing, setIsFollowing] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending' | 'accepted'>('none');
  const [socialLoading, setSocialLoading] = useState(true);

  // SAFELY parse interests whether it's the new array format or old string format
  const userInterests = Array.isArray(userProfile.interests) 
    ? userProfile.interests 
    : typeof userProfile.interests === 'string'
      ? userProfile.interests.split(',').map((i: string) => i.trim()).filter(Boolean)
      : [];

  useFocusEffect(
    useCallback(() => {
      fetchUserContent();
      checkSocialStatus();
    }, [userProfile.id])
  );

  async function checkSocialStatus() {
    if (!session?.user?.id) return;
    try {
      setSocialLoading(true);

      // 1. Check Follow Status
      const { data: followData } = await supabase
        .from('user_followers')
        .select('id')
        .eq('follower_id', session.user.id)
        .eq('following_id', userProfile.id)
        .single();
      
      if (followData) setIsFollowing(true);

      // 2. Check Friend Status (Checks both directions)
      const { data: friendData } = await supabase
        .from('user_friends')
        .select('status, user_id_1, user_id_2')
        .or(`and(user_id_1.eq.${session.user.id},user_id_2.eq.${userProfile.id}),and(user_id_1.eq.${userProfile.id},user_id_2.eq.${session.user.id})`)
        .single();

      if (friendData) {
        setFriendStatus(friendData.status); 
      } else {
        setFriendStatus('none');
      }

    } catch (e: any) {
      console.log("Social status check:", e.message);
    } finally {
      setSocialLoading(false);
    }
  }

  async function fetchUserContent() {
    try {
      setLoading(true);

      // Fetch User's Forum Posts
      const { data: postsData, error: postsError } = await supabase
        .from('forum_posts')
        .select(`*, author:author_id ( username, avatar_url ), likes:forum_likes ( user_id ), comments:forum_comments ( id )`)
        .eq('author_id', userProfile.id)
        .order('created_at', { ascending: false });

      if (!postsError && postsData) {
        setPosts(postsData.map(p => ({
          ...p,
          likesCount: p.likes.length,
          isLiked: p.likes.some((like: any) => like.user_id === session?.user?.id),
          commentsCount: p.comments ? p.comments.length : 0
        })));
      }

      // Fetch User's Marketplace Listings
      const { data: listingsData, error: listingsError } = await supabase
        .from('market_items')
        .select('*')
        .eq('seller_id', userProfile.id)
        .order('created_at', { ascending: false });

      if (!listingsError && listingsData) setListings(listingsData);

    } catch (error: any) {
      Alert.alert('Load Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  // --- SOCIAL GRAPH ACTIONS ---
  const handleToggleFollow = async () => {
    if (!session?.user?.id) return;
    const currentlyFollowing = isFollowing;
    setIsFollowing(!currentlyFollowing); 

    try {
      if (currentlyFollowing) {
        await supabase.from('user_followers').delete()
          .match({ follower_id: session.user.id, following_id: userProfile.id });
      } else {
        await supabase.from('user_followers').insert({ 
          follower_id: session.user.id, 
          following_id: userProfile.id 
        });

        // Notify User with distinct 'user_follow' type
        await supabase.from('notifications').insert({
          actor_id: session.user.id,
          receiver_id: userProfile.id,
          type: 'user_follow', // <-- CHANGED
          target_id: session.user.id,
          is_read: false,
        });
      }
    } catch (e: any) {
      setIsFollowing(currentlyFollowing); 
      Alert.alert("Action Failed", "Could not update follow status.");
    }
  };

  const handleAddFriend = async () => {
    if (!session?.user?.id) return;
    try {
      setFriendStatus('pending'); 

      await supabase.from('user_friends').insert({
        user_id_1: session.user.id,
        user_id_2: userProfile.id,
        status: 'pending'
      });

      // --- NEW: Send Friend Request Notification ---
      await supabase.from('notifications').insert({
        actor_id: session.user.id,
        receiver_id: userProfile.id,
        type: 'friend_request', // <-- NEW
        target_id: session.user.id,
        is_read: false,
      });
      // -------------------------------------------

      Alert.alert("Request Sent", `A friend request has been sent to ${userProfile.username}.`);
    } catch (e: any) {
      setFriendStatus('none');
      Alert.alert("Request Failed", e.message);
    }
  };

  const handleMessageUser = () => {
    if (friendStatus !== 'accepted') {
      Alert.alert(
        "Messaging Restricted", 
        "You must be friends with this user to send a direct personal message. If you are inquiring about a marketplace item, please message them directly from the item listing."
      );
      return;
    }

    navigation.navigate('Inbox', {
      session: session,
      sellerId: userProfile.id,
      sellerName: userProfile.username,
      sellerAvatar: userProfile.avatar_url
    });
  };

  // --- RENDERERS ---
  const renderPostCard = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.postCard} 
      activeOpacity={0.8} 
      onPress={() => navigation.navigate('Thread', { post: item, session })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={styles.postTopicBadge}>{item.topic}</Text>
        <Text style={styles.postDateText}>
          {new Date(item.created_at).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}
        </Text>
      </View>
      <Text style={styles.postTitle}>{item.title}</Text>
      <Text style={styles.postBodyText} numberOfLines={2}>{item.content}</Text>
      <View style={styles.postFooter}>
        <View style={styles.actionPill}>
          <Ionicons name="heart" size={16} color={item.isLiked ? "#EF4444" : "#94A3B8"} />
          <Text style={styles.actionPillText}>{item.likesCount}</Text>
        </View>
        <View style={styles.actionPill}>
          <Ionicons name="chatbox" size={16} color="#94A3B8" />
          <Text style={styles.actionPillText}>{item.commentsCount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderListingCard = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.listingCard} 
      activeOpacity={0.9} 
      onPress={() => {
        Alert.alert("Item", item.title); 
      }}
    >
      <View style={styles.listingImageContainer}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.listingImage} />
        ) : (
          <Ionicons name="image-outline" size={40} color="#CBD5E1" />
        )}
      </View>
      <View style={styles.listingDetails}>
        <Text style={styles.listingPrice}>R {Number(item.price).toLocaleString('en-ZA')}</Text>
        <Text style={styles.listingTitle} numberOfLines={1}>{item.title}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.mainContainer}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 45) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Public Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={activeTab === 'Posts' ? posts : listings}
        keyExtractor={(item) => item.id}
        renderItem={activeTab === 'Posts' ? renderPostCard : renderListingCard}
        numColumns={activeTab === 'Listings' ? 2 : 1}
        key={activeTab} 
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.profileHeaderSection}>
            <View style={styles.avatarRow}>
              <View style={styles.avatarWrapper}>
                {userProfile.avatar_url ? (
                  <Image source={{ uri: userProfile.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person-circle" size={80} color="#CBD5E1" />
                )}
              </View>
              <View style={styles.userInfoBlock}>
                <Text style={styles.usernameText}>{userProfile.username || 'Member'}</Text>
                
                <View style={styles.metaBadgeRow}>
                  {userProfile.location && (
                    <View style={styles.metaBadge}>
                      <Ionicons name="location" size={12} color="#34C759" />
                      <Text style={styles.metaBadgeText}>{userProfile.location}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {userProfile.bio && (
              <Text style={styles.bioText}>{userProfile.bio}</Text>
            )}

            {/* INTERESTS PILLS */}
            {userInterests.length > 0 && (
              <View style={styles.interestsContainer}>
                {userInterests.map((interest: string, index: number) => (
                  <View key={index} style={styles.interestPill}>
                    <Text style={styles.interestPillText}>{interest}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* SOCIAL ACTIONS BLOCK */}
            {session?.user?.id !== userProfile.id && (
              <View style={styles.socialActionRow}>
                <TouchableOpacity 
                  style={[styles.primaryButton, isFollowing && styles.buttonActive]}
                  onPress={handleToggleFollow}
                  disabled={socialLoading}
                >
                  <Ionicons name={isFollowing ? "checkmark" : "add"} size={16} color={isFollowing ? "#fff" : "#fff"} />
                  <Text style={styles.primaryButtonText}>{isFollowing ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>

                {friendStatus === 'none' ? (
                  <TouchableOpacity style={styles.secondaryButton} onPress={handleAddFriend} disabled={socialLoading}>
                    <Ionicons name="person-add" size={16} color="#1E293B" />
                    <Text style={styles.secondaryButtonText}>Add Friend</Text>
                  </TouchableOpacity>
                ) : friendStatus === 'pending' ? (
                  <View style={[styles.secondaryButton, { backgroundColor: '#F1F5F9' }]}>
                    <Ionicons name="time" size={16} color="#64748B" />
                    <Text style={[styles.secondaryButtonText, { color: '#64748B' }]}>Requested</Text>
                  </View>
                ) : (
                  <View style={[styles.secondaryButton, { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' }]}>
                    <Ionicons name="people" size={16} color="#34C759" />
                    <Text style={[styles.secondaryButtonText, { color: '#34C759' }]}>Friends</Text>
                  </View>
                )}

                <TouchableOpacity style={styles.iconButton} onPress={handleMessageUser}>
                  <Ionicons name="chatbubbles" size={20} color="#3B82F6" />
                </TouchableOpacity>
              </View>
            )}

            {/* TAB SELECTOR */}
            <View style={styles.tabContainer}>
              <TouchableOpacity style={[styles.tab, activeTab === 'Posts' && styles.activeTab]} onPress={() => setActiveTab('Posts')}>
                <Text style={[styles.tabText, activeTab === 'Posts' && styles.activeTabText]}>Forum Posts</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, activeTab === 'Listings' && styles.activeTab]} onPress={() => setActiveTab('Listings')}>
                <Text style={[styles.tabText, activeTab === 'Listings' && styles.activeTabText]}>Marketplace</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color="#34C759" style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name={activeTab === 'Posts' ? "chatbubbles-outline" : "pricetag-outline"} size={48} color="#CBD5E1" />
              <Text style={styles.emptyStateText}>
                No {activeTab === 'Posts' ? 'posts' : 'listings'} available yet.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  
  profileHeaderSection: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrapper: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F1F5F9', overflow: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#E2E8F0' },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  userInfoBlock: { marginLeft: 16, flex: 1 },
  usernameText: { fontSize: 22, fontWeight: '800', color: '#1E293B' },
  metaBadgeRow: { flexDirection: 'row', marginTop: 6 },
  metaBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  metaBadgeText: { fontSize: 12, fontWeight: '700', color: '#34C759', marginLeft: 4 },
  
  bioText: { fontSize: 14, color: '#475569', marginTop: 16, lineHeight: 22 },
  
  interestsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  interestPill: { backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  interestPillText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  
  socialActionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 8 },
  primaryButton: { flex: 1.5, flexDirection: 'row', backgroundColor: '#3B82F6', height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  buttonActive: { backgroundColor: '#34C759' },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 6 },
  secondaryButton: { flex: 1.5, flexDirection: 'row', backgroundColor: '#fff', height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  secondaryButtonText: { color: '#1E293B', fontSize: 14, fontWeight: '700', marginLeft: 6 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  
  tabContainer: { flexDirection: 'row', marginTop: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#34C759' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  activeTabText: { color: '#34C759', fontWeight: '800' },
  
  postCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  postTopicBadge: { fontSize: 11, fontWeight: '800', color: '#3B82F6', textTransform: 'uppercase' },
  postDateText: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  postTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  postBodyText: { fontSize: 14, color: '#475569', lineHeight: 20 },
  postFooter: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  actionPill: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  actionPillText: { fontSize: 13, color: '#64748B', fontWeight: '600', marginLeft: 6 },
  
  listingCard: { backgroundColor: '#fff', width: COLUMN_WIDTH, borderRadius: 16, marginBottom: 16, marginHorizontal: 4, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' },
  listingImageContainer: { width: '100%', height: COLUMN_WIDTH, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  listingImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  listingDetails: { padding: 12 },
  listingPrice: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  listingTitle: { fontSize: 13, color: '#64748B', fontWeight: '500', marginTop: 2 },
  
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyStateText: { fontSize: 14, color: '#94A3B8', fontWeight: '500', marginTop: 12 }
});
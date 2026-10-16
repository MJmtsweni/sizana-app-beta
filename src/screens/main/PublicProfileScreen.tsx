import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Image, TouchableOpacity, FlatList, 
  ActivityIndicator, Alert, Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import ListingDetailsModal from './ListingDetailsModal';

import { colors, fontFamily } from '../../theme';
const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;

// Mirrors the listing_type values used in MarketScreen
const LISTING_TYPE_TABS: { key: string; label: string; icon: any }[] = [
  { key: 'All', label: 'All', icon: 'apps' },
  { key: 'product', label: 'Products', icon: 'cube' },
  { key: 'service', label: 'Services', icon: 'construct' },
  { key: 'property', label: 'Property', icon: 'home' },
  { key: 'vehicle', label: 'Vehicles', icon: 'car' },
  { key: 'job', label: 'Jobs', icon: 'briefcase' },
];

export default function PublicProfileScreen({ route, navigation }: any) {
  const { userProfile, session } = route.params || {};
  const insets = useSafeAreaInsets();

  // Whoever navigated here passed a missing/undefined profile — fail gracefully
  // instead of crashing on userProfile.id below. This can't fully replace fixing
  // the actual caller, but it means a bad navigation call degrades to an error
  // screen instead of a hard crash, no matter which screen the tap came from.
  if (!userProfile || !userProfile.id) {
    return (
      <View style={styles.mainContainer}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 45) }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Public Profile</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="person-remove-outline" size={48} color={colors.borderStrong} />
          <Text style={styles.emptyStateText}>This profile isn't available right now.</Text>
        </View>
      </View>
    );
  }

  const [activeTab, setActiveTab] = useState<'Posts' | 'Listings'>('Posts');
  const [listingTypeFilter, setListingTypeFilter] = useState('All');
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Social Graph States
  const [isFollowing, setIsFollowing] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending' | 'accepted'>('none');
  const [socialLoading, setSocialLoading] = useState(true);

  // SAFELY parse interests whether it's the new array format or old string format
  // Safely parse interests to prevent JSON crash
let userInterests: string[] = [];

if (userProfile?.interests) {
  if (Array.isArray(userProfile.interests)) {
    userInterests = userProfile.interests;
  } else if (typeof userProfile.interests === 'string') {
    try {
      // Try to parse it as a JSON array (e.g. '["Tech", "Farming"]')
      userInterests = JSON.parse(userProfile.interests);
    } catch (e) {
      // If it fails (e.g. it's an empty string "" or comma-separated "Tech, Farming"), 
      // fall back to splitting by comma, or just return an empty array if blank.
      if (userProfile.interests.trim() !== '') {
        userInterests = userProfile.interests.split(',').map((i: string) => i.trim());
      }
    }
  }
}

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

      // Fetch User's Marketplace Listings (all types — filtered client-side by the sub-tabs below)
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
          <Ionicons name="heart" size={16} color={item.isLiked ? colors.danger : colors.textTertiary} />
          <Text style={styles.actionPillText}>{item.likesCount}</Text>
        </View>
        <View style={styles.actionPill}>
          <Ionicons name="chatbox" size={16} color={colors.textTertiary} />
          <Text style={styles.actionPillText}>{item.commentsCount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderListingCard = ({ item }: { item: any }) => {
    const typeInfo = LISTING_TYPE_TABS.find(t => t.key === item.listing_type);
    return (
      <TouchableOpacity 
        style={styles.listingCard} 
        activeOpacity={0.9} 
        onPress={() => {
          setSelectedListing(item);
          setDetailsModalVisible(true);
        }}
      >
        <View style={styles.listingImageContainer}>
          {(item.image_urls?.[0] || item.image_url) ? (
            <Image source={{ uri: item.image_urls?.[0] || item.image_url }} style={styles.listingImage} />
          ) : (
            <Ionicons name="image-outline" size={40} color={colors.borderStrong} />
          )}
          {typeInfo && (
            <View style={styles.listingTypeBadge}>
              <Ionicons name={typeInfo.icon} size={10} color={colors.white} />
            </View>
          )}
        </View>
        <View style={styles.listingDetails}>
          <Text style={styles.listingPrice}>
            R {Number(item.price).toLocaleString('en-ZA')}{item.listing_type === 'job' ? ' /mo' : ''}
          </Text>
          <Text style={styles.listingTitle} numberOfLines={1}>{item.title}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredListings = listingTypeFilter === 'All'
    ? listings
    : listings.filter(item => item.listing_type === listingTypeFilter);

  return (
    <View style={styles.mainContainer}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 45) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Public Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={activeTab === 'Posts' ? posts : filteredListings}
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
                  <Ionicons name="person-circle" size={80} color={colors.borderStrong} />
                )}
              </View>
              <View style={styles.userInfoBlock}>
                <Text style={styles.usernameText}>{userProfile.username || 'Member'}</Text>
                
                <View style={styles.metaBadgeRow}>
                  {userProfile.location && (
                    <View style={styles.metaBadge}>
                      <Ionicons name="location" size={12} color={colors.brand} />
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
                  <Ionicons name={isFollowing ? "checkmark" : "add"} size={16} color={isFollowing ? colors.white : colors.white} />
                  <Text style={styles.primaryButtonText}>{isFollowing ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>

                {friendStatus === 'none' ? (
                  <TouchableOpacity style={styles.secondaryButton} onPress={handleAddFriend} disabled={socialLoading}>
                    <Ionicons name="person-add" size={16} color={colors.textPrimary} />
                    <Text style={styles.secondaryButtonText}>Add Friend</Text>
                  </TouchableOpacity>
                ) : friendStatus === 'pending' ? (
                  <View style={[styles.secondaryButton, { backgroundColor: colors.slate[100] }]}>
                    <Ionicons name="time" size={16} color={colors.textSecondary} />
                    <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>Requested</Text>
                  </View>
                ) : (
                  <View style={[styles.secondaryButton, { backgroundColor: colors.brandSubtle, borderColor: colors.brandSubtleStrong }]}>
                    <Ionicons name="people" size={16} color={colors.brand} />
                    <Text style={[styles.secondaryButtonText, { color: colors.brand }]}>Friends</Text>
                  </View>
                )}

                <TouchableOpacity style={styles.iconButton} onPress={handleMessageUser}>
                  <Ionicons name="chatbubbles" size={20} color={colors.accent} />
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

            {/* LISTING TYPE SUB-TABS — only relevant once the Marketplace tab is active */}
            {activeTab === 'Listings' && (
              <FlatList
                data={LISTING_TYPE_TABS}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.subTypeTabsContainer}
                keyExtractor={(item) => item.key}
                renderItem={({ item }) => {
                  const active = listingTypeFilter === item.key;
                  return (
                    <TouchableOpacity
                      style={[styles.subTypeTab, active && styles.subTypeTabActive]}
                      onPress={() => setListingTypeFilter(item.key)}
                    >
                      <Ionicons name={item.icon} size={13} color={active ? colors.white : colors.textSecondary} style={{ marginRight: 5 }} />
                      <Text style={[styles.subTypeTabText, active && styles.subTypeTabTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name={activeTab === 'Posts' ? "chatbubbles-outline" : "pricetag-outline"} size={48} color={colors.borderStrong} />
              <Text style={styles.emptyStateText}>
                {activeTab === 'Posts' 
                  ? 'No posts available yet.' 
                  : listingTypeFilter === 'All' 
                    ? 'No listings available yet.' 
                    : `No ${LISTING_TYPE_TABS.find(t => t.key === listingTypeFilter)?.label.toLowerCase()} yet.`}
              </Text>
            </View>
          )
        }
      />

      <ListingDetailsModal
        visible={detailsModalVisible}
        item={selectedListing}
        session={session}
        navigation={navigation}
        onClose={() => setDetailsModalVisible(false)}
        onChanged={fetchUserContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: colors.backgroundMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.slate[100], justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontFamily: fontFamily.extrabold, color: colors.textPrimary },
  
  profileHeaderSection: { backgroundColor: colors.white, borderRadius: 20, padding: 20, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatarWrapper: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.slate[100], overflow: 'hidden', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.border },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  userInfoBlock: { marginLeft: 16, flex: 1 },
  usernameText: { fontSize: 22, fontFamily: fontFamily.extrabold, color: colors.textPrimary },
  metaBadgeRow: { flexDirection: 'row', marginTop: 6 },
  metaBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.brandSubtle, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  metaBadgeText: { fontSize: 12, fontFamily: fontFamily.bold, color: colors.brand, marginLeft: 4 },
  
  bioText: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.slate[600], marginTop: 16, lineHeight: 22 },
  
  interestsContainer: { 
  flexDirection: 'row', 
  flexWrap: 'wrap', 
  marginTop: 16 
},
  interestPill: { backgroundColor: colors.slate[100], paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  interestPillText: { fontSize: 12, fontFamily: fontFamily.semibold, color: colors.slate[600] },
  
  socialActionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 8 },
  primaryButton: { flex: 1.5, flexDirection: 'row', backgroundColor: colors.accent, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  buttonActive: { backgroundColor: colors.brand },
  primaryButtonText: { color: colors.white, fontSize: 14, fontFamily: fontFamily.bold, marginLeft: 6 },
  secondaryButton: { flex: 1.5, flexDirection: 'row', backgroundColor: colors.white, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 14, fontFamily: fontFamily.bold, marginLeft: 6 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSubtle, justifyContent: 'center', alignItems: 'center' },
  
  tabContainer: { flexDirection: 'row', marginTop: 24, borderBottomWidth: 1, borderBottomColor: colors.slate[100] },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: colors.brand },
  tabText: { fontSize: 14, fontFamily: fontFamily.semibold, color: colors.textTertiary },
  activeTabText: { color: colors.brand, fontFamily: fontFamily.extrabold },

  subTypeTabsContainer: { paddingTop: 14, paddingBottom: 2, alignItems: 'center' },
  subTypeTab: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, marginRight: 8 },
  subTypeTabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  subTypeTabText: { fontSize: 12, fontFamily: fontFamily.bold, color: colors.textSecondary },
  subTypeTabTextActive: { color: colors.white },
  
  postCard: { backgroundColor: colors.white, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  postTopicBadge: { fontSize: 11, fontFamily: fontFamily.extrabold, color: colors.accent, textTransform: 'uppercase' },
  postDateText: { fontSize: 12, color: colors.textTertiary, fontFamily: fontFamily.medium },
  postTitle: { fontSize: 16, fontFamily: fontFamily.extrabold, color: colors.textPrimary, marginBottom: 6 },
  postBodyText: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.slate[600], lineHeight: 20 },
  postFooter: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.slate[100] },
  actionPill: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  actionPillText: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.semibold, marginLeft: 6 },
  
  listingCard: { backgroundColor: colors.white, width: COLUMN_WIDTH, borderRadius: 16, marginBottom: 16, marginHorizontal: 4, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  listingImageContainer: { width: '100%', height: COLUMN_WIDTH, backgroundColor: colors.slate[100], justifyContent: 'center', alignItems: 'center' },
  listingImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  listingTypeBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(30,41,59,0.7)', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  listingDetails: { padding: 12 },
  listingPrice: { fontSize: 15, fontFamily: fontFamily.extrabold, color: colors.textPrimary },
  listingTitle: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.medium, marginTop: 2 },
  
  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyStateText: { fontSize: 14, color: colors.textTertiary, fontFamily: fontFamily.medium, marginTop: 12 }
});
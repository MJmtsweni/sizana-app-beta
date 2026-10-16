import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, 
  ActivityIndicator, Linking, Alert, Modal, KeyboardAvoidingView, Platform, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase'; 
import EditBusinessModalScreen from './EditBusinessModalScreen';
import ListingDetailsModal from './ListingDetailsModal';

import { colors, fontFamily } from '../../theme';
export default function BusinessProfileScreen({ navigation, route }: any) {
  const { business, session } = route.params;
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState('About');
  const [editModalVisible, setEditModalVisible] = useState(false);
  
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loadingFollow, setLoadingFollow] = useState(true);

  const [currentBusiness, setCurrentBusiness] = useState(business);
  const [posts, setPosts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // --- LISTING DETAILS MODAL STATE ---
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [listingDetailsVisible, setListingDetailsVisible] = useState(false);

  // --- REVIEW MODAL STATE ---
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewScore, setReviewScore] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    checkFollowStatus();
    fetchFollowerCount();
  }, [business.id]);

  useEffect(() => {
    if (activeTab === 'Posts' && posts.length === 0) fetchBusinessPosts();
    if (activeTab === 'Events' && events.length === 0) fetchBusinessEvents();
    if (activeTab === 'Jobs' && listings.length === 0) fetchBusinessListings();
  }, [activeTab]);

  // --- INTERACTIVE HANDLERS ---
  const handleWhatsApp = (phone: string) => {
    if (!phone) return;
    const cleanNumber = phone.replace(/\D/g, '');
    Linking.openURL(`whatsapp://send?phone=${cleanNumber}`);
  };

  const handleEmail = (email: string) => {
    if (!email) return;
    Linking.openURL(`mailto:${email}`);
  };

  const handleOpenLink = async (url: string) => {
    if (!url) return;
    const formattedUrl = url.startsWith('http') ? url : `https://${url}`;
    const supported = await Linking.canOpenURL(formattedUrl);
    if (supported) await Linking.openURL(formattedUrl);
  };

  const handleDirections = () => {
    const query = encodeURIComponent(currentBusiness.location);
    Linking.openURL(`https://maps.google.com/?q=${query}`);
  };

  // --- DATA LOGIC ---
  const checkFollowStatus = async () => {
    if (!session?.user?.id) return;
    try {
      const { data } = await supabase
        .from('business_followers')
        .select('id')
        .eq('business_id', business.id)
        .eq('user_id', session.user.id)
        .single();
      if (data) setIsFollowing(true);
    } catch (e) {
      setIsFollowing(false);
    } finally {
      setLoadingFollow(false);
    }
  };

  const fetchBusinessDetails = async () => {
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', business.id)
      .single();
    if (data) setCurrentBusiness(data);
  };

  const fetchBusinessPosts = async () => {
    setLoadingContent(true);
    const { data } = await supabase
      .from('forum_posts')
      .select('*, author:author_id(username, avatar_url)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    if (data) setPosts(data);
    setLoadingContent(false);
  };

  const fetchBusinessEvents = async () => {
    setLoadingContent(true);
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('business_id', business.id)
      .gte('event_date', new Date().toISOString())
      .order('event_date', { ascending: true });
    if (data) setEvents(data);
    setLoadingContent(false);
  };

  // Business-posted listings are always Jobs (market_items enforces this via a
  // DB constraint — business_id can only be set when listing_type = 'job'),
  // so this doubles as "open positions" for the business.
  const fetchBusinessListings = async () => {
    setLoadingContent(true);
    const { data } = await supabase
      .from('market_items')
      .select(`
        id, title, description, price, category, image_url, image_urls, location, created_at, seller_id, listing_type, business_id,
        users!market_items_seller_id_fkey ( username, avatar_url, rating, is_verified ),
        business:business_id ( id, name, logo_url, creator_id )
      `)
      .eq('business_id', business.id)
      .order('created_at', { ascending: false });
    if (data) setListings(data);
    setLoadingContent(false);
  };

  const fetchFollowerCount = async () => {
    const { count } = await supabase
      .from('business_followers')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.id);
    setFollowerCount(count || 0);
  };

  const toggleFollow = async () => {
    if (!session?.user?.id) return;
    
    const currentlyFollowing = isFollowing;
    // Optimistic UI update
    setIsFollowing(!currentlyFollowing);
    setFollowerCount(prev => currentlyFollowing ? prev - 1 : prev + 1);

    try {
      if (currentlyFollowing) {
        // Unfollow
        const { error } = await supabase
          .from('business_followers')
          .delete()
          .eq('business_id', business.id)
          .eq('user_id', session.user.id);

        if (error) throw error;
      } else {
        // 1. Insert the follow record
        const { error: followError } = await supabase
          .from('business_followers')
          .insert({ business_id: business.id, user_id: session.user.id });

        if (followError) throw followError;

        // 2. Notify the business owner — only if the follower is not the owner themselves
        if (session.user.id !== currentBusiness.creator_id) {
          const { error: notifError } = await supabase.from('notifications').insert({
            actor_id: session.user.id,              // Who did the action
            receiver_id: currentBusiness.creator_id, // Who gets notified (business owner)
            type: 'follow',
            target_id: business.id,                  // So we can navigate to the business
            is_read: false,
          });

          if (notifError) console.error('Follow notification error:', notifError.message);
        }
      }
    } catch (e: any) {
      // Revert optimistic update on failure
      setIsFollowing(currentlyFollowing);
      setFollowerCount(prev => currentlyFollowing ? prev + 1 : prev - 1);
      Alert.alert("Action Failed", "Could not update follow status.");
    }
  };

  const handleSubmitReview = async () => {
    if (reviewScore === 0) {
      Alert.alert("Missing Rating", "Please select a star rating before submitting.");
      return;
    }
    if (!session?.user?.id) return;
    
    // GUARD: Prevent users from reviewing their own businesses
    if (session.user.id === currentBusiness.creator_id) {
      Alert.alert("Invalid Action", "You cannot review your own business profile.");
      return;
    }

    try {
      setSubmittingReview(true);
      
      // 1. Save the review to the database
      const { data: reviewData, error } = await supabase
        .from('user_reviews')
        .insert({
          rater_id: session.user.id,
          ratee_id: currentBusiness.creator_id,
          score: reviewScore,
          comment: reviewComment.trim() || null
        })
        .select('id') // We request the ID back to confirm successful insertion
        .single();

      if (error) {
        if (error.code === '23505') {
          Alert.alert("Already Reviewed", "You have already left a review for this business owner.");
        } else {
          throw error;
        }
        return;
      }

      // 2. Trigger the Notification to the business owner
      if (reviewData) {
        const { error: notifError } = await supabase.from('notifications').insert({
          actor_id: session.user.id,              // The person leaving the review
          receiver_id: currentBusiness.creator_id, // The business owner getting the review
          type: 'review',
          target_id: currentBusiness.id,           // Clicking the notif routes to this business page
          is_read: false,
        });
        
        if (notifError) console.error("Notification error:", notifError.message);
      }

      Alert.alert("Success", "Thank you! Your review has been posted.");
      setReviewModalVisible(false);
      setReviewScore(0);
      setReviewComment('');
      
    } catch (e: any) {
      Alert.alert("Error", "Could not submit review: " + e.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  // --- TAB RENDERERS ---
  const renderAboutTab = () => (
    <View style={styles.tabContentContainer}>
      <Text style={styles.sectionHeader}>About</Text>
      <Text style={styles.descriptionText}>{currentBusiness.description || "No description provided."}</Text>
      
      <View style={styles.infoCard}>
        <TouchableOpacity style={styles.infoRow} onPress={handleDirections}>
          <Ionicons name="location" size={20} color={colors.textSecondary} />
          <Text style={styles.infoText}>{currentBusiness.location}</Text>
        </TouchableOpacity>
        
        {currentBusiness.contact_email && (
          <TouchableOpacity style={styles.infoRow} onPress={() => handleEmail(currentBusiness.contact_email)}>
            <Ionicons name="mail" size={20} color={colors.brand} />
            <Text style={[styles.infoText, { color: colors.brand }]}>{currentBusiness.contact_email}</Text>
          </TouchableOpacity>
        )}

        {currentBusiness.whatsapp_number && (
          <TouchableOpacity style={styles.infoRow} onPress={() => handleWhatsApp(currentBusiness.whatsapp_number)}>
            <Ionicons name="logo-whatsapp" size={20} color={colors.whatsapp} />
            <Text style={[styles.infoText, { color: colors.whatsapp }]}>{currentBusiness.whatsapp_number}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderGalleryTab = () => (
    <View style={styles.tabContentContainer}>
      <View style={styles.galleryGrid}>
        {(currentBusiness.gallery || []).map((media: any) => (
          <TouchableOpacity key={media.id} style={styles.galleryItem} onPress={() => setSelectedImage(media.media_url)}>
            <Image source={{ uri: media.media_url }} style={styles.galleryImage} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderListingsTab = () => (
    <View style={styles.tabContentContainer}>
      {listings.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="briefcase-outline" size={48} color={colors.borderStrong} />
          <Text style={styles.emptyStateText}>No open positions right now.</Text>
        </View>
      ) : (
        <View style={styles.listingsGrid}>
          {listings.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.listingGridItem}
              activeOpacity={0.9}
              onPress={() => { setSelectedListing(item); setListingDetailsVisible(true); }}
            >
              <View style={styles.listingGridImageWrap}>
                {(item.image_urls?.[0] || item.image_url) ? (
                  <Image source={{ uri: item.image_urls?.[0] || item.image_url }} style={styles.listingGridImage} />
                ) : (
                  <Ionicons name="briefcase" size={32} color={colors.borderStrong} />
                )}
              </View>
              <View style={{ padding: 10 }}>
                <Text style={styles.listingGridPrice}>R {Number(item.price).toLocaleString('en-ZA')} /mo</Text>
                <Text style={styles.listingGridTitle} numberOfLines={1}>{item.title}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.mainContainer}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover Photo */}
        <View style={styles.coverPhotoContainer}>
          {currentBusiness.cover_photo_url ? (
            <Image source={{ uri: currentBusiness.cover_photo_url }} style={styles.coverPhoto} />
          ) : (
            <View style={[styles.coverPhoto, styles.coverPhotoPlaceholder]}>
              <Ionicons name="image-outline" size={36} color={colors.borderStrong} />
            </View>
          )}
          <TouchableOpacity style={[styles.backButton, { top: Math.max(insets.top, 20) }]} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Profile Meta */}
        <View style={styles.profileMetaContainer}>
          <View style={styles.logoWrapper}>
            {currentBusiness.logo_url ? (
              <Image source={{ uri: currentBusiness.logo_url }} style={styles.logoImage} />
            ) : (
              <Ionicons name="briefcase" size={32} color={colors.borderStrong} />
            )}
          </View>
          <Text style={styles.businessName}>{currentBusiness.name}</Text>
          <Text style={styles.categoryText}>
            {currentBusiness.category} • {followerCount} {followerCount === 1 ? 'Follower' : 'Followers'}
          </Text>

          {/* Primary actions — Follow/Edit and Message get real room to breathe */}
          <View style={styles.primaryActionRow}>
            {session?.user?.id !== currentBusiness.creator_id ? (
              <TouchableOpacity
                style={[styles.actionButton, isFollowing ? styles.buttonFollowing : styles.buttonPrimary]}
                onPress={toggleFollow}
                disabled={loadingFollow}
              >
                <Text style={[styles.actionButtonText, isFollowing && { color: colors.textPrimary }]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.actionButton, styles.buttonSecondary]} onPress={() => setEditModalVisible(true)}>
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Edit Page</Text>
              </TouchableOpacity>
            )}

            {session?.user?.id !== currentBusiness.creator_id && (
              <TouchableOpacity
                style={[styles.actionButton, styles.buttonPrimary]}
                onPress={() =>
                  navigation.navigate('Inbox', {
                    sellerId: currentBusiness.creator_id,
                    sellerName: currentBusiness.name,
                    sellerAvatar: currentBusiness.logo_url || null,
                    businessId: currentBusiness.id,
                    businessName: currentBusiness.name,
                    itemId: currentBusiness.id,
                    itemTitle: currentBusiness.name,
                    session: session,
                  })
                }
              >
                <Ionicons name="chatbubble-ellipses" size={16} color={colors.white} />
                <Text style={styles.actionButtonText}>Message</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Secondary actions — quick-contact icons, one clear row of their own */}
          <View style={styles.secondaryActionRow}>
            <TouchableOpacity style={styles.iconButton} onPress={() => setReviewModalVisible(true)}>
              <Ionicons name="star" size={20} color={colors.warning} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => handleWhatsApp(currentBusiness.whatsapp_number)}>
              <Ionicons name="logo-whatsapp" size={20} color={colors.whatsapp} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => handleEmail(currentBusiness.contact_email)}>
              <Ionicons name="mail" size={20} color={colors.brand} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {['About', 'Gallery', 'Posts', 'Events', 'Jobs'].map(tab => (
            <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.activeTab]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content Area */}
        <View style={styles.contentArea}>
          {activeTab === 'About' && renderAboutTab()}
          {activeTab === 'Gallery' && renderGalleryTab()}
          {activeTab === 'Posts' && (
            loadingContent ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> :
            posts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="newspaper-outline" size={48} color={colors.borderStrong} />
                <Text style={styles.emptyStateText}>No posts yet.</Text>
              </View>
            ) : posts.map(p => (
              <TouchableOpacity key={p.id} style={styles.postItem} onPress={() => navigation.navigate('Thread', { post: p, session })}>
                <Text style={styles.postTitle}>{p.title}</Text>
              </TouchableOpacity>
            ))
          )}
          {activeTab === 'Events' && (
            loadingContent ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> :
            events.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color={colors.borderStrong} />
                <Text style={styles.emptyStateText}>No upcoming events.</Text>
              </View>
            ) : events.map(e => (
              <TouchableOpacity key={e.id} style={styles.eventItem} onPress={() => navigation.navigate('EventDetail', { event: e, session })}>
                <Text style={styles.eventTitle}>{e.title}</Text>
              </TouchableOpacity>
            ))
          )}
          {activeTab === 'Jobs' && (
            loadingContent ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : renderListingsTab()
          )}
        </View>
      </ScrollView>

      <EditBusinessModalScreen
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        business={currentBusiness}
        onUpdate={fetchBusinessDetails}
      />
      
      {/* Full Screen Image Viewer */}
      <Modal visible={!!selectedImage} transparent={true} animationType="fade" onRequestClose={() => setSelectedImage(null)}>
        <View style={styles.fullScreenOverlay}>
          <TouchableOpacity style={[styles.closeImageButton, { top: Math.max(insets.top, 20) }]} onPress={() => setSelectedImage(null)}>
            <Ionicons name="close" size={28} color={colors.white} />
          </TouchableOpacity>
          {selectedImage && <Image source={{ uri: selectedImage }} style={styles.fullScreenImage} resizeMode="contain" />}
        </View>
      </Modal>
      {/* REVIEW MODAL */}
      <Modal visible={reviewModalVisible} transparent={true} animationType="slide" onRequestClose={() => setReviewModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rate this Business</Text>
              <TouchableOpacity onPress={() => setReviewModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontFamily: fontFamily.regular, fontSize: 14, color: colors.slate[600], marginBottom: 20, textAlign: 'center' }}>
              How was your experience with {currentBusiness.name}?
            </Text>

            {/* Interactive Stars */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 24, gap: 8 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setReviewScore(star)} style={{ padding: 4 }}>
                  <Ionicons 
                    name={reviewScore >= star ? "star" : "star-outline"} 
                    size={40} 
                    color={reviewScore >= star ? colors.warning : colors.borderStrong} 
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 13, fontFamily: fontFamily.bold, color: colors.textSecondary, marginBottom: 6, marginLeft: 4 }}>Add a comment (Optional)</Text>
            <TextInput
              style={{ backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontFamily: fontFamily.regular, fontSize: 15, color: colors.textPrimary, height: 100, textAlignVertical: 'top', marginBottom: 24 }}
              placeholder="Tell the community what you loved..."
              placeholderTextColor={colors.textTertiary}
              multiline
              value={reviewComment}
              onChangeText={setReviewComment}
            />

            <TouchableOpacity 
              style={{ backgroundColor: reviewScore > 0 ? colors.brand : colors.borderStrong, paddingVertical: 16, borderRadius: 16, alignItems: 'center' }} 
              onPress={handleSubmitReview}
              disabled={reviewScore === 0 || submittingReview}
            >
              {submittingReview ? <ActivityIndicator color={colors.white} /> : <Text style={{ color: colors.white, fontSize: 16, fontFamily: fontFamily.bold }}>Submit Review</Text>}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ListingDetailsModal
        visible={listingDetailsVisible}
        item={selectedListing}
        session={session}
        navigation={navigation}
        onClose={() => setListingDetailsVisible(false)}
        onChanged={fetchBusinessListings}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: colors.white },
  coverPhotoContainer: { width: '100%', height: 180, position: 'relative' },
  coverPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  coverPhotoPlaceholder: { backgroundColor: colors.slate[100], justifyContent: 'center', alignItems: 'center' },
  backButton: {
    position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'
  },
  profileMetaContainer: { paddingHorizontal: 16, marginTop: -40 },
  logoWrapper: {
    width: 80, height: 80, borderRadius: 16, backgroundColor: colors.white,
    justifyContent: 'center', alignItems: 'center', elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4,
    borderWidth: 3, borderColor: colors.white
  },
  logoImage: { width: '100%', height: '100%', borderRadius: 13, resizeMode: 'cover' },
  businessName: { fontSize: 24, fontFamily: fontFamily.extrabold, color: colors.textPrimary, marginTop: 12 },
  categoryText: { fontSize: 14, color: colors.textSecondary, marginTop: 4, fontFamily: fontFamily.medium },
  primaryActionRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 16,
  },
  secondaryActionRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.slate[100],
  },
  actionButton: {
    flex: 1, flexDirection: 'row', height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: 12
  },
  buttonPrimary: { backgroundColor: colors.brand },
  buttonFollowing: { backgroundColor: colors.slate[100], borderWidth: 1, borderColor: colors.border },
  buttonSecondary: { backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border },
  actionButtonText: { color: colors.white, fontSize: 15, fontFamily: fontFamily.bold, marginLeft: 6 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  tabsContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.slate[100] },
  tab: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: colors.brand },
  tabText: { fontSize: 14, fontFamily: fontFamily.semibold, color: colors.textSecondary },
  activeTabText: { color: colors.brand, fontFamily: fontFamily.extrabold },
  contentArea: { padding: 16, minHeight: 400 },
  tabContentContainer: { flex: 1 },
  sectionHeader: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.textPrimary, marginBottom: 12 },
  descriptionText: { fontFamily: fontFamily.regular, fontSize: 15, color: colors.slate[600], lineHeight: 24, marginBottom: 24 },
  infoCard: { backgroundColor: colors.backgroundMuted, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  infoText: { fontFamily: fontFamily.regular, fontSize: 15, color: colors.textPrimary, marginLeft: 12, flex: 1 },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  galleryItem: { width: '48%', marginBottom: 16 },
  galleryImage: { width: '100%', height: 150, borderRadius: 12, backgroundColor: colors.slate[100] },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyStateText: { fontSize: 15, color: colors.textTertiary, marginTop: 12, fontFamily: fontFamily.medium },
  postItem: {
    backgroundColor: colors.backgroundMuted, padding: 16, borderRadius: 12,
    marginBottom: 12, borderWidth: 1, borderColor: colors.border
  },
  postTitle: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.textPrimary, marginBottom: 4 },
  eventItem: {
    backgroundColor: colors.brandSubtle, padding: 16, borderRadius: 12,
    marginBottom: 12, borderWidth: 1, borderColor: colors.brandSubtleStrong
  },
  eventTitle: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.textPrimary, marginBottom: 4 },
  listingsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  listingGridItem: {
    width: '48%', backgroundColor: colors.white, borderRadius: 16, marginBottom: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: colors.border
  },
  listingGridImageWrap: { width: '100%', height: 100, backgroundColor: colors.slate[100], justifyContent: 'center', alignItems: 'center' },
  listingGridImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  listingGridPrice: { fontSize: 14, fontFamily: fontFamily.extrabold, color: colors.textPrimary },
  listingGridTitle: { fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.semibold, marginTop: 2 },
  fullScreenOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullScreenImage: { width: '100%', height: '100%' },
  closeImageButton: {
    position: 'absolute', right: 20, zIndex: 10,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  // --- MODAL STYLES ---
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.5)', // Dark semi-transparent background
    justifyContent: 'flex-end' 
  },
  modalContent: { 
    backgroundColor: colors.white, 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    padding: 24, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  modalTitle: { 
    fontSize: 20, 
    fontFamily: fontFamily.extrabold, 
    color: colors.textPrimary 
  },
});
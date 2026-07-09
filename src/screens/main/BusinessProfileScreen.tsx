import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, 
  ActivityIndicator, Linking, Alert, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase'; 
import EditBusinessModalScreen from './EditBusinessModalScreen';

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
  const [loadingContent, setLoadingContent] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    checkFollowStatus();
    fetchFollowerCount();
  }, [business.id]);

  useEffect(() => {
    if (activeTab === 'Posts' && posts.length === 0) fetchBusinessPosts();
    if (activeTab === 'Events' && events.length === 0) fetchBusinessEvents();
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

  // --- TAB RENDERERS ---
  const renderAboutTab = () => (
    <View style={styles.tabContentContainer}>
      <Text style={styles.sectionHeader}>About</Text>
      <Text style={styles.descriptionText}>{currentBusiness.description || "No description provided."}</Text>
      
      <View style={styles.infoCard}>
        <TouchableOpacity style={styles.infoRow} onPress={handleDirections}>
          <Ionicons name="location" size={20} color="#64748B" />
          <Text style={styles.infoText}>{currentBusiness.location}</Text>
        </TouchableOpacity>
        
        {currentBusiness.contact_email && (
          <TouchableOpacity style={styles.infoRow} onPress={() => handleEmail(currentBusiness.contact_email)}>
            <Ionicons name="mail" size={20} color="#34C759" />
            <Text style={[styles.infoText, { color: '#34C759' }]}>{currentBusiness.contact_email}</Text>
          </TouchableOpacity>
        )}

        {currentBusiness.whatsapp_number && (
          <TouchableOpacity style={styles.infoRow} onPress={() => handleWhatsApp(currentBusiness.whatsapp_number)}>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            <Text style={[styles.infoText, { color: '#25D366' }]}>{currentBusiness.whatsapp_number}</Text>
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

  return (
    <View style={styles.mainContainer}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Cover Photo */}
        <View style={styles.coverPhotoContainer}>
          <Image source={{ uri: currentBusiness.cover_photo_url }} style={styles.coverPhoto} />
          <TouchableOpacity style={[styles.backButton, { top: Math.max(insets.top, 20) }]} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Profile Meta */}
        <View style={styles.profileMetaContainer}>
          <View style={styles.logoWrapper}>
            <Image source={{ uri: currentBusiness.logo_url }} style={styles.logoImage} />
          </View>
          <Text style={styles.businessName}>{currentBusiness.name}</Text>
          <Text style={styles.categoryText}>{currentBusiness.category} • {followerCount} Followers</Text>

          {/* Action Bar */}
          <View style={styles.actionBar}>
            {session?.user?.id !== currentBusiness.creator_id ? (
              <TouchableOpacity
                style={[styles.actionButton, isFollowing ? styles.buttonFollowing : styles.buttonPrimary]}
                onPress={toggleFollow}
                disabled={loadingFollow}
              >
                <Text style={[styles.actionButtonText, isFollowing && { color: '#1E293B' }]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.actionButton, styles.buttonSecondary]} onPress={() => setEditModalVisible(true)}>
                <Text style={[styles.actionButtonText, { color: '#1E293B' }]}>Edit Page</Text>
              </TouchableOpacity>
            )}

            {session?.user?.id !== currentBusiness.creator_id && (
              <TouchableOpacity
    style={[styles.actionButton, styles.buttonPrimary, { flex: 0.9 }]}
    onPress={() =>
      navigation.navigate('Inbox', { // Updated to match your working route
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
    <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
    <Text style={styles.actionButtonText}>Message</Text>
  </TouchableOpacity>
            )}
            
            <TouchableOpacity style={styles.iconButton} onPress={() => handleWhatsApp(currentBusiness.whatsapp_number)}>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => handleEmail(currentBusiness.contact_email)}>
              <Ionicons name="mail" size={20} color="#34C759" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {['About', 'Gallery', 'Posts', 'Events'].map(tab => (
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
            loadingContent ? <ActivityIndicator color="#34C759" style={{ marginTop: 40 }} /> :
            posts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="newspaper-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyStateText}>No posts yet.</Text>
              </View>
            ) : posts.map(p => (
              <TouchableOpacity key={p.id} style={styles.postItem} onPress={() => navigation.navigate('Thread', { post: p, session })}>
                <Text style={styles.postTitle}>{p.title}</Text>
              </TouchableOpacity>
            ))
          )}
          {activeTab === 'Events' && (
            loadingContent ? <ActivityIndicator color="#34C759" style={{ marginTop: 40 }} /> :
            events.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyStateText}>No upcoming events.</Text>
              </View>
            ) : events.map(e => (
              <TouchableOpacity key={e.id} style={styles.eventItem} onPress={() => navigation.navigate('EventDetail', { event: e, session })}>
                <Text style={styles.eventTitle}>{e.title}</Text>
              </TouchableOpacity>
            ))
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
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {selectedImage && <Image source={{ uri: selectedImage }} style={styles.fullScreenImage} resizeMode="contain" />}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#fff' },
  coverPhotoContainer: { width: '100%', height: 180, position: 'relative' },
  coverPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  backButton: {
    position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'
  },
  profileMetaContainer: { paddingHorizontal: 16, marginTop: -40 },
  logoWrapper: {
    width: 80, height: 80, borderRadius: 16, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4,
    borderWidth: 3, borderColor: '#fff'
  },
  logoImage: { width: '100%', height: '100%', borderRadius: 13, resizeMode: 'cover' },
  businessName: { fontSize: 24, fontWeight: '800', color: '#1E293B', marginTop: 12 },
  categoryText: { fontSize: 14, color: '#64748B', marginTop: 4, fontWeight: '500' },
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9'
  },
  actionButton: {
    flex: 1, flexDirection: 'row', height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: 12
  },
  buttonPrimary: { backgroundColor: '#34C759' },
  buttonFollowing: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  buttonSecondary: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  actionButtonText: { color: '#fff', fontSize: 15, fontWeight: '700', marginLeft: 6 },
  iconButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  tabsContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tab: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#34C759' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  activeTabText: { color: '#34C759', fontWeight: '800' },
  contentArea: { padding: 16, minHeight: 400 },
  tabContentContainer: { flex: 1 },
  sectionHeader: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  descriptionText: { fontSize: 15, color: '#475569', lineHeight: 24, marginBottom: 24 },
  infoCard: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  infoText: { fontSize: 15, color: '#1E293B', marginLeft: 12, flex: 1 },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  galleryItem: { width: '48%', marginBottom: 16 },
  galleryImage: { width: '100%', height: 150, borderRadius: 12, backgroundColor: '#F1F5F9' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyStateText: { fontSize: 15, color: '#94A3B8', marginTop: 12, fontWeight: '500' },
  postItem: {
    backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12,
    marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0'
  },
  postTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  eventItem: {
    backgroundColor: '#F0FDF4', padding: 16, borderRadius: 12,
    marginBottom: 12, borderWidth: 1, borderColor: '#DCFCE7'
  },
  eventTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  fullScreenOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullScreenImage: { width: '100%', height: '100%' },
  closeImageButton: {
    position: 'absolute', right: 20, zIndex: 10,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
});

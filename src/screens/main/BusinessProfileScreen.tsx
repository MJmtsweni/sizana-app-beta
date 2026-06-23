import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, 
  ActivityIndicator, Linking, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase'; 
import EditBusinessModalScreen from './EditBusinessModalScreen';

export default function BusinessProfileScreen({ navigation, route }: any) {
  const { business, session } = route.params; // Expects the business object passed from the directory
  const insets = useSafeAreaInsets();

  // Screen State
  const [activeTab, setActiveTab] = useState('About'); // 'About', 'Gallery', 'Posts', 'Events'
  
  const [editModalVisible, setEditModalVisible] = useState(false);
  
  // Community State
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loadingFollow, setLoadingFollow] = useState(true);

  // current "live" business data
  const [currentBusiness, setCurrentBusiness] = useState(business);

  // Content State (To be fetched when tabs are clicked)
  const [posts, setPosts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);


  useEffect(() => {
    checkFollowStatus();
    fetchFollowerCount();
  }, [business.id]);

  useEffect(() => {
    if (activeTab === 'Posts' && posts.length === 0) fetchBusinessPosts();
    if (activeTab === 'Events' && events.length === 0) fetchBusinessEvents();
  }, [activeTab]);

  // --- COMMUNITY LOGIC ---
  const checkFollowStatus = async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from('business_followers')
        .select('id')
        .eq('business_id', business.id)
        .eq('user_id', session.user.id)
        .single();
        
      if (data) setIsFollowing(true);
    } catch (e) {
      // Catch silent misses (not an error, just means they don't follow)
      setIsFollowing(false);
    } finally {
      setLoadingFollow(false);
    }
  };

  const fetchBusinessDetails = async () => {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', business.id)
      .single();

    if (data) {
      setCurrentBusiness(data);
    }
  };

  // Fetch Posts for this specific business
  const fetchBusinessPosts = async () => {
    setLoadingContent(true);
    const { data, error } = await supabase
      .from('forum_posts')
      .select('*, author:author_id(username, avatar_url)')
      .eq('business_id', business.id) // Only posts linked to this biz
      .order('created_at', { ascending: false });
    
    if (data) setPosts(data);
    setLoadingContent(false);
  };

  // Fetch Events for this specific business
  const fetchBusinessEvents = async () => {
    setLoadingContent(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('business_id', business.id) // Only events linked to this biz
      .gte('event_date', new Date().toISOString()) // Only future events
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
    
    // Optimistic UI Update for zero-latency UX
    setIsFollowing(!isFollowing);
    setFollowerCount(prev => isFollowing ? prev - 1 : prev + 1);

    try {
      if (isFollowing) {
        // Unfollow
        await supabase.from('business_followers')
          .delete()
          .eq('business_id', business.id)
          .eq('user_id', session.user.id);
      } else {
        // Follow
        await supabase.from('business_followers')
          .insert({ business_id: business.id, user_id: session.user.id });
      }
    } catch (e: any) {
      // Revert if database fails
      setIsFollowing(isFollowing);
      setFollowerCount(prev => isFollowing ? prev + 1 : prev - 1);
      Alert.alert("Action Failed", "Could not update follow status.");
    }
  };

  // --- ACTION HELPERS ---
  const handleOpenLink = async (url: string) => {
    if (!url) return;
    const formattedUrl = url.startsWith('http') ? url : `https://${url}`;
    const supported = await Linking.canOpenURL(formattedUrl);
    if (supported) await Linking.openURL(formattedUrl);
  };

  const handleDirections = () => {
    const query = encodeURIComponent(business.location);
    Linking.openURL(`https://maps.google.com/?q=${query}`);
  };

  // --- TAB RENDERERS ---
  const renderAboutTab = () => (
    <View style={styles.tabContentContainer}>
      <Text style={styles.sectionHeader}>About the Business</Text>
      <Text style={styles.descriptionText}>{currentBusiness.description || "No description provided."}</Text>
      
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="location" size={20} color="#64748B" />
          <Text style={styles.infoText}>{currentBusiness.location}</Text>
        </View>
        {currentBusiness.operating_hours && (
          <View style={styles.infoRow}>
            <Ionicons name="time" size={20} color="#64748B" />
            <Text style={styles.infoText}>{currentBusiness.operating_hours}</Text>
          </View>
        )}
        {currentBusiness.contact_email && (
          <View style={styles.infoRow}>
            <Ionicons name="mail" size={20} color="#64748B" />
            <Text style={styles.infoText}>{currentBusiness.contact_email}</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderGalleryTab = () => (
    <View style={styles.tabContentContainer}>
      {(!currentBusiness.gallery || currentBusiness.gallery.length === 0) ? (
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={48} color="#CBD5E1" />
          <Text style={styles.emptyStateText}>No portfolio images yet.</Text>
        </View>
      ) : (
        <View style={styles.galleryGrid}>
          {currentBusiness.gallery.map((media: any) => (
            <View key={media.id} style={styles.galleryItem}>
              <Image source={{ uri: media.media_url }} style={styles.galleryImage} />
              {media.label && <Text style={styles.galleryLabel} numberOfLines={1}>{media.label}</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.mainContainer}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        
        {/* 1. HERO HEADER (Cover Photo) */}
        <View style={styles.coverPhotoContainer}>
          {currentBusiness.cover_photo_url ? (
    <Image source={{ uri: currentBusiness.cover_photo_url }} style={styles.coverPhoto} />
  ) : (
            <View style={[styles.coverPhoto, { backgroundColor: '#E2E8F0' }]} />
          )}
          {/* Floating Back Button */}
          <TouchableOpacity 
            style={[styles.backButton, { top: Math.max(insets.top, 20) }]} 
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* 2. PROFILE INFO (Overlapping Logo) */}
        <View style={styles.profileMetaContainer}>
          <View style={styles.logoWrapper}>
           {currentBusiness.logo_url ? (
      <Image source={{ uri: currentBusiness.logo_url }} style={styles.logoImage} />
    ) : (
              <Ionicons name="briefcase" size={40} color="#94A3B8" />
            )}
          </View>

          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.businessName}>{currentBusiness.name}</Text>
              <Text style={styles.categoryText}>{currentBusiness.category} • {followerCount} Followers</Text>
            </View>
          </View>

          {/* 3. ACTION BAR */}
          <View style={styles.actionBar}>
            {/* Primary Action: Follow */}
            {session?.user?.id !== currentBusiness.creator_id ? (
              <TouchableOpacity 
                style={[styles.actionButton, isFollowing ? styles.buttonFollowing : styles.buttonPrimary]} 
                onPress={toggleFollow}
                disabled={loadingFollow}
              >
                <Ionicons name={isFollowing ? "checkmark" : "add"} size={18} color={isFollowing ? "#1E293B" : "#fff"} />
                <Text style={[styles.actionButtonText, isFollowing && { color: '#1E293B' }]}>
                  {isFollowing ? 'Following' : 'Follow Page'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.actionButton, styles.buttonSecondary]} onPress={() => setEditModalVisible(true)}>
                <Ionicons name="create-outline" size={18} color="#1E293B" />
                <Text style={[styles.actionButtonText, { color: '#1E293B' }]}>Edit Page</Text>
              </TouchableOpacity>
            )}

            {/* Secondary Actions: Message & Maps */}
            {session?.user?.id !== currentBusiness.creator_id && (
              <TouchableOpacity 
                style={[styles.iconButton, { backgroundColor: '#F1F5F9' }]}
                onPress={() => navigation.navigate('Chat', { recipientId: currentBusiness.creator_id, recipientName: currentBusiness.name, session: session })}
              >
                <Ionicons name="chatbubble-ellipses" size={20} color="#3B82F6" />
              </TouchableOpacity>
            )}

            {currentBusiness.website_url && (
              <TouchableOpacity style={[styles.iconButton, { backgroundColor: '#F1F5F9' }]} onPress={() => handleOpenLink(currentBusiness.website_url)}>
                <Ionicons name="globe-outline" size={20} color="#10B981" />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.iconButton, { backgroundColor: '#F1F5F9' }]} onPress={handleDirections}>
              <Ionicons name="navigate" size={20} color="#F59E0B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. HORIZONTAL TABS */}
        <View style={styles.tabsContainer}>
          {['About', 'Gallery', 'Posts', 'Events'].map((tab) => (
            <TouchableOpacity 
              key={tab} 
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 5. TAB CONTENT RENDERING */}
        <View style={styles.contentArea}>
          {activeTab === 'About' && renderAboutTab()}
          {activeTab === 'Gallery' && renderGalleryTab()}
          
          {activeTab === 'Posts' && (
            loadingContent ? <ActivityIndicator color="#34C759" /> :
            posts.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyStateText}>No posts from this business yet.</Text>
              </View>
            ) : (
              posts.map(post => (
                <View key={post.id} style={styles.postItem}>
                  <Text style={styles.postTitle}>{post.title}</Text>
                  <Text numberOfLines={2}>{post.content}</Text>
                </View>
              ))
            )
          )}

          {activeTab === 'Events' && (
            loadingContent ? <ActivityIndicator color="#34C759" /> :
            events.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptyStateText}>No upcoming events.</Text>
              </View>
            ) : (
              events.map(event => (
                <View key={event.id} style={styles.eventItem}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text>{new Date(event.event_date).toLocaleDateString()}</Text>
                </View>
              ))
            )
          )}
        </View>

      </ScrollView>
      <EditBusinessModalScreen 
    visible={editModalVisible} 
    onClose={() => setEditModalVisible(false)} 
    business={currentBusiness} 
    onUpdate={() => {
      fetchBusinessDetails(); // This triggers the refresh automatically!
      Alert.alert("Success", "Business updated!");
    }}
  />
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
  titleRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  businessName: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
  categoryText: { fontSize: 14, color: '#64748B', marginTop: 4, fontWeight: '500' },
  
  actionBar: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  actionButton: { flex: 1, flexDirection: 'row', height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
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
  galleryLabel: { fontSize: 13, fontWeight: '600', color: '#1E293B', marginTop: 6 },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyStateText: { fontSize: 15, color: '#94A3B8', marginTop: 12, fontWeight: '500' },
  postItem: { 
    backgroundColor: '#F8FAFC', 
    padding: 16, 
    borderRadius: 12, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#E2E8F0' 
  },
  postTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  eventItem: { 
    backgroundColor: '#F0FDF4', 
    padding: 16, 
    borderRadius: 12, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#DCFCE7' 
  },
  eventTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
});
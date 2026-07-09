import React, { useState, useCallback, useRef } from 'react';
import { 
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, 
  Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, FlatList,
  Animated, Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen({ route, navigation }: any) {
  const session = route?.params?.session;
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<any>(null);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [userEvents, setUserEvents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('Posts');
  const [loading, setLoading] = useState(true);
  const [userListings, setUserListings] = useState<any[]>([]);

  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [userBusinesses, setUserBusinesses] = useState<any[]>([]);

  // Create FAB State
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      fetchUserData();
    }, [])
  );

  async function fetchUserData() {
    if (!session?.user?.id) return;
    try {
      setLoading(true);
      
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (profileError) throw profileError;
      if (profileData) {
        setProfile(profileData);
        setEditUsername(profileData.username || '');
        setEditBio(profileData.bio || '');
        setEditLocation(profileData.location || '');
        setEditAvatarUri(profileData.avatar_url || null);
      }

      const { data: postsData } = await supabase
        .from('forum_posts')
        .select('*, comments:forum_comments(id)')
        .eq('author_id', session.user.id)
        .order('created_at', { ascending: false });
      
      if (postsData) {
        setUserPosts(postsData.map(p => ({ ...p, commentsCount: p.comments?.length || 0 })));
      }

      const { data: eventsData } = await supabase
        .from('event_rsvps')
        .select('events(*)')
        .eq('user_id', session.user.id);
      
      if (eventsData) {
        setUserEvents(eventsData.map((e: any) => e.events));
      }

    } catch (error: any) {
      console.error("Profile fetch error:", error.message);
    } finally {
      setLoading(false);
    }

    // Fetch User's Businesses
      const { data: bizData } = await supabase
        .from('business_roles')
        .select('businesses(*)')
        .eq('user_id', session.user.id)
        .eq('role', 'owner');
      
      if (bizData) {
        setUserBusinesses(bizData.map((b: any) => b.businesses));
      }

      const { data: marketData } = await supabase
        .from('buy_and_sell') // Update if your table has a different name
        .select('*')
        .eq('seller_id', session.user.id); // Update if your column is named 'author_id'
      
      if (marketData) setUserListings(marketData);
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0].uri) {
      setEditAvatarUri(result.assets[0].uri);
    }
  }

  async function handleSaveProfile() {
    try {
      setSaving(true);
      let finalAvatarUrl = profile?.avatar_url;

      if (editAvatarUri && !editAvatarUri.startsWith('http')) {
        const fileExt = editAvatarUri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
        const response = await fetch(editAvatarUri);
        const blob = await response.blob();
        const formData = new FormData();
        
        formData.append('file', { uri: editAvatarUri, name: fileName, type: `image/${fileExt}` } as any);
        
        const { error: uploadError } = await supabase.storage.from('Avatars').upload(fileName, formData);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('Avatars').getPublicUrl(fileName);
        finalAvatarUrl = publicUrl;
      }

      const { error } = await supabase
        .from('users')
        .update({
          username: editUsername,
          bio: editBio,
          location: editLocation,
          avatar_url: finalAvatarUrl
        })
        .eq('id', session.user.id);

      if (error) throw error;

      setEditModalVisible(false);
      fetchUserData();

    } catch (error: any) {
      Alert.alert("Update Failed", error.message);
    } finally {
      setSaving(false);
    }
  }

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: async () => {
          await supabase.auth.signOut();
      }}
    ]);
  };

  const handleOpenSettings = () => {
    Alert.alert("Settings", undefined, [
      { text: "Edit Profile", onPress: () => setEditModalVisible(true) },
      { text: "Log Out", style: "destructive", onPress: handleSignOut },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const toggleCreateMenu = () => {
    Animated.spring(menuAnim, {
      toValue: menuOpen ? 0 : 1,
      useNativeDriver: true,
      friction: 7,
      tension: 70,
    }).start();
    setMenuOpen(!menuOpen);
  };

  const goCreate = (screen: string) => {
    toggleCreateMenu();
    navigation.navigate(screen);
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

  const renderPostItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.activityCard} 
      onPress={() => navigation.navigate('Thread', { post: item, session: session })}
    >
      <Text style={styles.activityBadge}>{item.topic}</Text>
      <Text style={styles.activityTitle}>{item.title}</Text>
      <View style={styles.activityMetaRow}>
        <View style={styles.metaAuthorRow}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.metaAvatar} />
          ) : (
            <View style={[styles.metaAvatar, styles.metaAvatarPlaceholder]}>
              <Ionicons name="person" size={9} color="#94A3B8" />
            </View>
          )}
          <Text style={styles.activityMetaText}>{formatTime(item.created_at)}</Text>
        </View>
        <Text style={styles.commentCluster}>💬 {item.commentsCount}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderEventItem = ({ item }: { item: any }) => {
    if (!item) return null;
    const date = new Date(item.event_date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
    return (
      <TouchableOpacity 
        style={styles.activityCard}
        onPress={() => navigation.navigate('EventDetail', { id: item.id, session: session })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.eventDateBox}>
            <Text style={styles.eventDateText}>{date}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.activityTitle}>{item.title}</Text>
            <Text style={styles.activityMetaText}>{item.location}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !profile) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#34C759" /></View>;
  }

  const joinedYear = profile?.created_at
    ? new Date(profile.created_at).getFullYear()
    : (session?.user?.created_at ? new Date(session.user.created_at).getFullYear() : null);

  const createActions = [
    { key: 'Post', icon: 'chatbubbles' as const, color: '#3B82F6', bg: '#EFF6FF', screen: 'Forums' },
    { key: 'Sell Item', icon: 'pricetag' as const, color: '#34C759', bg: '#F0FDF4', screen: 'Buy & Sell' },
    { key: 'Event', icon: 'calendar' as const, color: '#EF4444', bg: '#FEF2F2', screen: 'Events' },
    { key: 'Business', icon: 'briefcase' as const, color: '#F59E0B', bg: '#FFFBEB', screen: 'Business' },
  ];

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.headerBackground, { paddingTop: Math.max(insets.top, 45) }]}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity onPress={handleOpenSettings} style={{ padding: 4 }}>
            <Ionicons name="settings-outline" size={24} color="#64748B" />
          </TouchableOpacity>
        </View>

        <View style={styles.profileInfoContainer}>
          <View style={styles.avatarShadowWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={40} color="#94A3B8" />
              </View>
            )}
          </View>
          
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.usernameText}>{profile?.username || 'Community Member'}</Text>

            {/* --- TRUST & IDENTITY BADGE CLUSTER --- */}
            <View style={styles.trustBadgeRow}>
              {profile?.rating != null && (
                <View style={styles.trustBadge}>
                  <Text style={styles.trustBadgeText}>⭐ {Number(profile.rating).toFixed(1)} Rating</Text>
                </View>
              )}
              {profile?.is_verified && (
                <View style={[styles.trustBadge, styles.verifiedBadge]}>
                  <Ionicons name="checkmark-circle" size={11} color="#34C759" style={{ marginRight: 3 }} />
                  <Text style={[styles.trustBadgeText, { color: '#34C759' }]}>Verified Member</Text>
                </View>
              )}
              {joinedYear && (
                <View style={styles.trustBadge}>
                  <Text style={styles.trustBadgeText}>Joined {joinedYear}</Text>
                </View>
              )}
            </View>
            
            {profile?.location && (
              <View style={styles.locationRow}>
                <Ionicons name="location" size={14} color="#64748B" />
                <Text style={styles.locationText}>{profile.location}</Text>
              </View>
            )}
            
            {profile?.bio && (
              <Text style={styles.bioText}>{profile.bio}</Text>
            )}

            <TouchableOpacity style={styles.editProfileBtn} onPress={() => setEditModalVisible(true)}>
              <Text style={styles.editProfileBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* TABS */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.tabContainer}
        contentContainerStyle={styles.tabContentRow}
      >
        {['Posts', 'My RSVPs', 'Businesses', 'Shop'].map(tab => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity 
              key={tab} 
              style={styles.tabButton}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
              {active && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* TAB CONTENT */}
      {activeTab === 'Posts' && (
        <FlatList 
          data={userPosts} 
          keyExtractor={(item) => item.id} 
          renderItem={renderPostItem} 
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }} 
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyLayout}>
              <Ionicons name="chatbubbles-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>You haven't posted anything yet.</Text>
            </View>
          }
        />
      )}
      
      {activeTab === 'My RSVPs' && (
        <FlatList 
          data={userEvents} 
          keyExtractor={(item) => item?.id} 
          renderItem={renderEventItem} 
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }} 
          showsVerticalScrollIndicator={false} 
          ListEmptyComponent={
            <View style={styles.emptyLayout}>
              <Ionicons name="calendar-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>No upcoming RSVPs.</Text>
            </View>
          }
        />
      )}

      {activeTab === 'Businesses' && (
        <FlatList 
          data={userBusinesses} 
          keyExtractor={(item) => item?.id} 
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }} 
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyLayout}>
              <Ionicons name="briefcase-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>You haven't registered any businesses.</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (!item) return null;
            return (
              <TouchableOpacity style={styles.activityCard} onPress={() => navigation.navigate('Business')}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {item.logo_url ? (
                    <Image source={{ uri: item.logo_url }} style={{ width: 40, height: 40, borderRadius: 8, marginRight: 12 }} />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 8, marginRight: 12, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="briefcase" size={20} color="#94A3B8" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle}>{item.name}</Text>
                    <Text style={styles.activityMetaText}>{item.category}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )
          }} 
        />
      )}

      {activeTab === 'Shop' && (
        <FlatList 
          data={userListings} 
          keyExtractor={(item) => item.id} 
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyLayout}>
              <Ionicons name="pricetag-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>You haven't listed any items.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.activityCard}>
              <Text style={styles.activityTitle}>{item.title}</Text>
              <Text style={styles.activityMetaText}>Price: R{item.price}</Text>
            </TouchableOpacity>
          )} 
        />
      )}

      {/* --- CREATE FAB + BLOSSOM MENU --- */}
      {menuOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={toggleCreateMenu}>
          <Animated.View 
            style={[
              styles.fabBackdrop, 
              { opacity: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }
            ]} 
          />
        </Pressable>
      )}

      {createActions.map((action, index) => {
        const translateY = menuAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -((index + 1) * 62)],
        });
        return (
          <Animated.View
            key={action.key}
            pointerEvents={menuOpen ? 'auto' : 'none'}
            style={[
              styles.fabMiniWrap,
              { bottom: insets.bottom + 30, opacity: menuAnim, transform: [{ translateY }, { scale: menuAnim }] }
            ]}
          >
            <Text style={styles.fabMiniLabel}>{action.key}</Text>
            <TouchableOpacity 
              style={[styles.fabMiniButton, { backgroundColor: action.bg }]} 
              onPress={() => goCreate(action.screen)}
            >
              <Ionicons name={action.icon} size={20} color={action.color} />
            </TouchableOpacity>
          </Animated.View>
        );
      })}

      <TouchableOpacity 
        style={[styles.fabMain, { bottom: insets.bottom + 30 }]} 
        activeOpacity={0.85} 
        onPress={toggleCreateMenu}
      >
        <Animated.View style={{
          transform: [{
            rotate: menuAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] })
          }]
        }}>
          <Ionicons name="add" size={30} color="#fff" />
        </Animated.View>
      </TouchableOpacity>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={editModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.editAvatarContainer}>
                <TouchableOpacity onPress={pickImage} style={styles.editAvatarWrapper}>
                  {editAvatarUri ? (
                    <Image source={{ uri: editAvatarUri }} style={styles.editAvatarImage} />
                  ) : (
                    <View style={[styles.editAvatarImage, styles.avatarPlaceholder]}>
                      <Ionicons name="camera" size={32} color="#94A3B8" />
                    </View>
                  )}
                  <View style={styles.editAvatarBadge}>
                    <Ionicons name="pencil" size={12} color="#fff" />
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Username</Text>
              <TextInput style={styles.inputField} value={editUsername} onChangeText={setEditUsername} placeholder="Your display name" />
              
              <Text style={styles.inputLabel}>Location</Text>
              <TextInput style={styles.inputField} value={editLocation} onChangeText={setEditLocation} placeholder="e.g. Schweizer-Reneke, NW" />

              <Text style={styles.inputLabel}>Bio</Text>
              <TextInput 
                style={[styles.inputField, { height: 80, textAlignVertical: 'top' }]} 
                multiline 
                value={editBio} 
                onChangeText={setEditBio} 
                placeholder="e.g. Founder | Tech Enthusiast" 
              />

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  headerBackground: { backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
  
  profileInfoContainer: { flexDirection: 'row', alignItems: 'flex-start' },

  avatarShadowWrap: {
    borderRadius: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarImage: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: '#fff' },
  avatarPlaceholder: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  
  usernameText: { fontSize: 20, fontWeight: '800', color: '#1E293B' },

  trustBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginBottom: 4 },
  trustBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
    marginRight: 6, marginBottom: 6,
  },
  verifiedBadge: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  trustBadgeText: { fontSize: 11, fontWeight: '700', color: '#475569' },

  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  locationText: { fontSize: 13, color: '#64748B', marginLeft: 4, fontWeight: '500' },
  bioText: { fontSize: 14, color: '#475569', marginTop: 8, lineHeight: 20 },
  
  editProfileBtn: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#F1F5F9', borderRadius: 20, alignSelf: 'flex-start' },
  editProfileBtnText: { fontSize: 13, fontWeight: '700', color: '#1E293B' },

  tabContainer: { backgroundColor: '#F8FAFC', flexGrow: 0 },
  tabContentRow: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, alignItems: 'center' },
  tabButton: { alignItems: 'center', marginRight: 24 },
  tabText: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },
  tabTextActive: { color: '#34C759' },
  activeIndicator: { marginTop: 9, height: 3, width: '100%', borderRadius: 2, backgroundColor: '#34C759' },

  activityCard: {
    backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  activityTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
  activityMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityBadge: { fontSize: 10, fontWeight: '800', color: '#34C759', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  activityMetaText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },

  metaAuthorRow: { flexDirection: 'row', alignItems: 'center' },
  metaAvatar: { width: 18, height: 18, borderRadius: 9, marginRight: 6 },
  metaAvatarPlaceholder: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  commentCluster: { fontSize: 12, color: '#94A3B8', fontWeight: '700' },
  
  eventDateBox: { backgroundColor: '#F0FDF4', padding: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minWidth: 60 },
  eventDateText: { fontSize: 12, fontWeight: '800', color: '#34C759', textAlign: 'center' },

  emptyLayout: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 12 },

  // FAB
  fabBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  fabMain: {
    position: 'absolute', right: 20, width: 58, height: 58, borderRadius: 29,
    backgroundColor: '#34C759', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#34C759', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  fabMiniWrap: { position: 'absolute', right: 24, flexDirection: 'row', alignItems: 'center' },
  fabMiniLabel: {
    backgroundColor: '#1E293B', color: '#fff', fontSize: 12, fontWeight: '700',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginRight: 10, overflow: 'hidden',
  },
  fabMiniButton: {
    width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },

  // Modal Styling
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  
  editAvatarContainer: { alignItems: 'center', marginBottom: 24 },
  editAvatarWrapper: { position: 'relative' },
  editAvatarImage: { width: 100, height: 100, borderRadius: 50 },
  editAvatarBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#3B82F6', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },

  inputLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 6, marginLeft: 4 },
  inputField: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#1E293B', marginBottom: 16 },
  
  saveButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
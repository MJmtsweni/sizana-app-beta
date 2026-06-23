import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, 
  Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, FlatList 
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

  const renderPostItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.activityCard} 
      onPress={() => navigation.navigate('Thread', { post: item, session: session })}
    >
      <Text style={styles.activityTitle}>{item.title}</Text>
      <View style={styles.activityMetaRow}>
        <Text style={styles.activityBadge}>{item.topic}</Text>
        <Text style={styles.activityMetaText}>{item.commentsCount} Comments</Text>
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

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.headerBackground, { paddingTop: Math.max(insets.top, 45) }]}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity onPress={handleSignOut} style={{ padding: 4 }}>
            <Ionicons name="log-out-outline" size={26} color="#EF4444" />
          </TouchableOpacity>
        </View>

        <View style={styles.profileInfoContainer}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={40} color="#94A3B8" />
            </View>
          )}
          
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.usernameText}>{profile?.username || 'Community Member'}</Text>
            
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

        {/* --- NEW: QUICK ACTIONS HUB --- */}
        <Text style={styles.quickActionsTitle}>Create</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsRow}>
          <TouchableOpacity style={styles.actionSquare} onPress={() => navigation.navigate('Forums')}>
            <View style={[styles.actionIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="chatbubbles" size={24} color="#3B82F6" />
            </View>
            <Text style={styles.actionSquareText}>Post</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionSquare} onPress={() => navigation.navigate('Buy & Sell')}>
            <View style={[styles.actionIconBox, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="pricetag" size={24} color="#34C759" />
            </View>
            <Text style={styles.actionSquareText}>Sell Item</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionSquare} onPress={() => navigation.navigate('Events')}>
            <View style={[styles.actionIconBox, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="calendar" size={24} color="#EF4444" />
            </View>
            <Text style={styles.actionSquareText}>Event</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionSquare} onPress={() => navigation.navigate('Business')}>
            <View style={[styles.actionIconBox, { backgroundColor: '#FFFBEB' }]}>
              <Ionicons name="briefcase" size={24} color="#F59E0B" />
            </View>
            <Text style={styles.actionSquareText}>Business</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* TABS */}
      <View style={styles.tabContainer}>
        {['Posts', 'My RSVPs', 'Businesses', 'Marketplace'].map(tab => (
          <TouchableOpacity 
            key={tab} 
            style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* TAB CONTENT */}
      {activeTab === 'Posts' && (
        <FlatList data={userPosts} keyExtractor={(item) => item.id} renderItem={renderPostItem} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false} />
      )}
      
      {activeTab === 'My RSVPs' && (
        <FlatList data={userEvents} keyExtractor={(item) => item?.id} renderItem={renderEventItem} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false} />
      )}

      {activeTab === 'Businesses' && (
        <FlatList 
          data={userBusinesses} 
          keyExtractor={(item) => item?.id} 
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }} 
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

      {activeTab === 'Marketplace' && (
        <FlatList 
          data={userListings} 
          keyExtractor={(item) => item.id} 
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
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
  
  headerBackground: { backgroundColor: '#fff', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
  
  profileInfoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  avatarImage: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#F1F5F9' },
  avatarPlaceholder: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  
  usernameText: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  locationText: { fontSize: 13, color: '#64748B', marginLeft: 4, fontWeight: '500' },
  bioText: { fontSize: 14, color: '#475569', marginTop: 8, lineHeight: 20 },
  
  editProfileBtn: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#F1F5F9', borderRadius: 20, alignSelf: 'flex-start' },
  editProfileBtnText: { fontSize: 13, fontWeight: '700', color: '#1E293B' },

  // Quick Actions Styling
  quickActionsTitle: { fontSize: 14, fontWeight: '800', color: '#64748B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  quickActionsRow: { flexDirection: 'row', paddingBottom: 8 },
  actionSquare: { alignItems: 'center', marginRight: 20 },
  actionIconBox: { width: 56, height: 56, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionSquareText: { fontSize: 12, fontWeight: '600', color: '#475569' },

  tabContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, backgroundColor: '#F8FAFC' },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabButtonActive: { borderBottomColor: '#34C759' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#34C759' },

  activityCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  activityTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
  activityMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityBadge: { fontSize: 11, fontWeight: '800', color: '#3B82F6', textTransform: 'uppercase' },
  activityMetaText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  
  eventDateBox: { backgroundColor: '#F0FDF4', padding: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minWidth: 60 },
  eventDateText: { fontSize: 12, fontWeight: '800', color: '#34C759', textAlign: 'center' },

  emptyLayout: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 12 },

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
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
import { compressImage } from '../../lib/mediaCompression';
import { withRetry } from '../../lib/network';
import { INTEREST_CATEGORIES, SA_REGIONS } from '../../lib/profileOptions';
import { signOutOfSocialProviders } from '../../lib/socialAuth';



import { colors, fontFamily } from '../../theme';
export default function ProfileScreen({ route, navigation }: any) {
  const session = route?.params?.session;
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<any>(null);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [userEvents, setUserEvents] = useState<any[]>([]);
  const [userListings, setUserListings] = useState<any[]>([]);
  const [userReviews, setUserReviews] = useState<any[]>([]); // NEW: State for reviews
  const [activeTab, setActiveTab] = useState('Posts');
  const [loading, setLoading] = useState(true);

  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [editRegions, setEditRegions] = useState<string[]>([]);
  const [editInterests, setEditInterests] = useState<string[]>([]);
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
      
      const { data: profileData, error: profileError } = await withRetry(() => supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single());
      
      if (profileError) throw profileError;
      if (profileData) {
        setProfile(profileData);
        setEditUsername(profileData.username || '');
        setEditBio(profileData.bio || '');
        setEditLocation(profileData.location || '');
        setEditAvatarUri(profileData.avatar_url || null);
        setEditRegions(profileData.regions || []);
        setEditInterests(profileData.interests || []);
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
        .from('market_items') 
        .select('*')
        .eq('seller_id', session.user.id); 
      
      if (marketData) setUserListings(marketData);

      // --- NEW: Fetch User's Received Reviews ---
      const { data: reviewsData } = await supabase
        .from('user_reviews')
        .select('*, rater:rater_id(username, avatar_url)')
        .eq('ratee_id', session.user.id)
        .order('created_at', { ascending: false });

      if (reviewsData) setUserReviews(reviewsData);

    } catch (error: any) {
      console.error("Profile fetch error:", error.message);
    } finally {
      setLoading(false);
    }
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

  const toggleEditRegion = (city: string) => {
    if (editRegions.includes(city)) {
      setEditRegions(prev => prev.filter(r => r !== city));
    } else {
      if (editRegions.length >= 3) {
        Alert.alert("Limit Reached", "You can only select up to 3 regions of interest.");
        return;
      }
      setEditRegions(prev => [...prev, city]);
    }
  };

  const toggleEditInterest = (topic: string) => {
    if (editInterests.includes(topic)) {
      setEditInterests(prev => prev.filter(t => t !== topic));
    } else {
      setEditInterests(prev => [...prev, topic]);
    }
  };


  async function handleSaveProfile() {
    try {
      setSaving(true);
      let finalAvatarUrl = profile?.avatar_url;

      if (editAvatarUri && !editAvatarUri.startsWith('http')) {
        const compressed = await compressImage(editAvatarUri, { maxDimension: 800 });
        const fileExt = 'jpg';
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
        const formData = new FormData();

        formData.append('file', { uri: compressed.uri, name: fileName, type: `image/${fileExt}` } as any);
        
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, formData);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
        finalAvatarUrl = publicUrl;
      }

      const { error } = await supabase
        .from('users')
        .update({
          username: editUsername,
          bio: editBio,
          location: editLocation,
          avatar_url: finalAvatarUrl,
          regions: editRegions,
          interests: editInterests,
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
          await signOutOfSocialProviders();
          await supabase.auth.signOut();
      }}
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This permanently deletes your login, profile, messages, friends, and activity. Businesses, events, and posts you created stay up but are reattributed to \"Deleted User\" so other people's follows and replies aren't broken. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            // Second, more explicit confirmation — this is irreversible and
            // Alert has no typed-confirmation input cross-platform, so a
            // two-step tap is the safety net instead.
            Alert.alert(
              "Are you absolutely sure?",
              "Your account will be deleted immediately and cannot be recovered.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, delete my account",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const { error } = await supabase.rpc('delete_account');
                      if (error) throw error;
                      await signOutOfSocialProviders();
                      await supabase.auth.signOut();
                    } catch (e: any) {
                      Alert.alert("Couldn't delete account", e.message || "Please try again, or contact support if this keeps happening.");
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const handleOpenSettings = () => {
    Alert.alert("Settings", undefined, [
      { text: "Edit Profile", onPress: () => setEditModalVisible(true) },
      { text: "Log Out", style: "destructive", onPress: handleSignOut },
      { text: "Delete Account", style: "destructive", onPress: handleDeleteAccount },
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
              <Ionicons name="person" size={9} color={colors.textTertiary} />
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

  // --- NEW: Review Item Renderer ---
  const renderReviewItem = ({ item }: { item: any }) => (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.raterInfo}>
          {item.rater?.avatar_url ? (
            <Image source={{ uri: item.rater.avatar_url }} style={styles.raterAvatar} />
          ) : (
            <Ionicons name="person-circle" size={36} color={colors.borderStrong} />
          )}
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.raterName}>{item.rater?.username || 'Community Member'}</Text>
            <Text style={styles.reviewDate}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Ionicons
              key={star}
              name={item.score >= star ? "star" : "star-outline"}
              size={14}
              color={item.score >= star ? colors.warning : colors.borderStrong}
            />
          ))}
        </View>
      </View>
      {item.comment && (
        <Text style={styles.reviewComment}>{item.comment}</Text>
      )}
    </View>
  );

  if (loading && !profile) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }

  const joinedYear = profile?.created_at
    ? new Date(profile.created_at).getFullYear()
    : (session?.user?.created_at ? new Date(session.user.created_at).getFullYear() : null);

  const createActions = [
    { key: 'Post', icon: 'chatbubbles' as const, color: colors.accent, bg: colors.accentSubtle, screen: 'Forums' },
    { key: 'Sell Item', icon: 'pricetag' as const, color: colors.brand, bg: colors.brandSubtle, screen: 'Buy & Sell' },
    { key: 'Event', icon: 'calendar' as const, color: colors.danger, bg: colors.dangerSubtle, screen: 'Events' },
    { key: 'Business', icon: 'briefcase' as const, color: colors.warning, bg: colors.warningSubtle, screen: 'Business' },
  ];

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.headerBackground, { paddingTop: Math.max(insets.top, 45) }]}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* NEW: Friends/Network Button */}
            <TouchableOpacity 
              onPress={() => navigation.navigate('Friends', { session })} 
              style={{ padding: 4, marginRight: 12 }}
            >
              <Ionicons name="people-outline" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            
            {/* EXISTING: Settings Button */}
            <TouchableOpacity onPress={handleOpenSettings} style={{ padding: 4 }}>
              <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileInfoContainer}>
          <View style={styles.avatarShadowWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarImage, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={40} color={colors.textTertiary} />
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
                  <Ionicons name="checkmark-circle" size={11} color={colors.brand} style={{ marginRight: 3 }} />
                  <Text style={[styles.trustBadgeText, { color: colors.brand }]}>Verified Member</Text>
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
                <Ionicons name="location" size={14} color={colors.textSecondary} />
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
        {/* Added 'Reviews' to the array */}
        {['Posts', 'My RSVPs', 'Businesses', 'Market', 'Reviews'].map(tab => {
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
              <Ionicons name="chatbubbles-outline" size={48} color={colors.borderStrong} />
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
              <Ionicons name="calendar-outline" size={48} color={colors.borderStrong} />
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
              <Ionicons name="briefcase-outline" size={48} color={colors.borderStrong} />
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
                    <View style={{ width: 40, height: 40, borderRadius: 8, marginRight: 12, backgroundColor: colors.slate[100], justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="briefcase" size={20} color={colors.textTertiary} />
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

      {activeTab === 'Market' && (
        <FlatList 
          data={userListings} 
          keyExtractor={(item) => item.id} 
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyLayout}>
              <Ionicons name="pricetag-outline" size={48} color={colors.borderStrong} />
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

      {/* --- NEW REVIEWS TAB --- */}
      {activeTab === 'Reviews' && (
        <FlatList 
          data={userReviews} 
          keyExtractor={(item) => item.id} 
          renderItem={renderReviewItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyLayout}>
              <Ionicons name="star-outline" size={48} color={colors.borderStrong} />
              <Text style={styles.emptyText}>You haven't received any reviews yet.</Text>
            </View>
          }
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
          <Ionicons name="add" size={30} color={colors.white} />
        </Animated.View>
      </TouchableOpacity>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={editModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.editAvatarContainer}>
                <TouchableOpacity onPress={pickImage} style={styles.editAvatarWrapper}>
                  {editAvatarUri ? (
                    <Image source={{ uri: editAvatarUri }} style={styles.editAvatarImage} />
                  ) : (
                    <View style={[styles.editAvatarImage, styles.avatarPlaceholder]}>
                      <Ionicons name="camera" size={32} color={colors.textTertiary} />
                    </View>
                  )}
                  <View style={styles.editAvatarBadge}>
                    <Ionicons name="pencil" size={12} color={colors.white} />
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Username</Text>
              <TextInput style={styles.inputField} value={editUsername} onChangeText={setEditUsername} placeholder="Your display name" />
              
              <Text style={styles.inputLabel}>Primary Location</Text>
              <TextInput style={styles.inputField} value={editLocation} onChangeText={setEditLocation} placeholder="e.g. Schweizer-Reneke, NW" />

              <Text style={styles.inputLabel}>Bio</Text>
              <TextInput 
                style={[styles.inputField, { height: 80, textAlignVertical: 'top' }]} 
                multiline 
                value={editBio} 
                onChangeText={setEditBio} 
                placeholder="e.g. Founder | Tech Enthusiast" 
              />

              {/* --- REGIONS OF INTEREST --- */}
              <View style={{ marginTop: 8, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={styles.inputLabel}>Regions of Interest</Text>
                  <Text style={{ fontSize: 12, fontFamily: fontFamily.bold, color: colors.accent }}>{editRegions.length} / 3</Text>
                </View>
                
                {Object.entries(SA_REGIONS).map(([province, cities]) => (
                  <View key={province} style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, fontFamily: fontFamily.extrabold, color: colors.textTertiary, textTransform: 'uppercase', marginBottom: 8 }}>{province}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {cities.map((city) => {
                        const isActive = editRegions.includes(city);
                        return (
                          <TouchableOpacity 
                            key={city} 
                            style={[styles.pill, isActive && styles.pillActive]}
                            onPress={() => toggleEditRegion(city)}
                          >
                            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{city}</Text>
                            {isActive && <Ionicons name="close" size={14} color={colors.white} style={{ marginLeft: 6 }} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>

              {/* --- TOPICS OF INTEREST --- */}
              <View style={{ marginBottom: 24 }}>
                <Text style={[styles.inputLabel, { marginBottom: 12 }]}>Topics of Interest</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {INTEREST_CATEGORIES.map((topic) => {
                    const isActive = editInterests.includes(topic);
                    return (
                      <TouchableOpacity 
                        key={topic} 
                        style={[styles.pill, isActive && styles.pillActive]}
                        onPress={() => toggleEditInterest(topic)}
                      >
                        <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{topic}</Text>
                        {isActive && <Ionicons name="checkmark" size={14} color={colors.white} style={{ marginLeft: 6 }} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
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
  mainContainer: { flex: 1, backgroundColor: colors.backgroundMuted },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  headerBackground: { backgroundColor: colors.white, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 24, fontFamily: fontFamily.extrabold, color: colors.textPrimary },
  
  profileInfoContainer: { flexDirection: 'row', alignItems: 'flex-start' },

  avatarShadowWrap: {
    borderRadius: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarImage: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: colors.white },
  avatarPlaceholder: { backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  
  usernameText: { fontSize: 20, fontFamily: fontFamily.extrabold, color: colors.textPrimary },

  trustBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, marginBottom: 4 },
  trustBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
    marginRight: 6, marginBottom: 6,
  },
  verifiedBadge: { backgroundColor: colors.brandSubtle, borderColor: colors.brandSubtleStrong },
  trustBadgeText: { fontSize: 11, fontFamily: fontFamily.bold, color: colors.slate[600] },

  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  locationText: { fontSize: 13, color: colors.textSecondary, marginLeft: 4, fontFamily: fontFamily.medium },
  bioText: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.slate[600], marginTop: 8, lineHeight: 20 },
  
  editProfileBtn: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.slate[100], borderRadius: 20, alignSelf: 'flex-start' },
  editProfileBtnText: { fontSize: 13, fontFamily: fontFamily.bold, color: colors.textPrimary },

  tabContainer: { backgroundColor: colors.backgroundMuted, height: 54, flexShrink: 0 },
  tabContentRow: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, alignItems: 'center' },
  tabButton: { alignItems: 'center', marginRight: 24 },
  tabText: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.textTertiary },
  tabTextActive: { color: colors.brand },
  activeIndicator: { marginTop: 9, height: 3, width: '100%', borderRadius: 2, backgroundColor: colors.brand },

  activityCard: {
    backgroundColor: colors.white, padding: 16, borderRadius: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  activityTitle: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.textPrimary, marginBottom: 8 },
  activityMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityBadge: { fontSize: 10, fontFamily: fontFamily.extrabold, color: colors.brand, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  activityMetaText: { fontSize: 12, color: colors.textTertiary, fontFamily: fontFamily.semibold },

  metaAuthorRow: { flexDirection: 'row', alignItems: 'center' },
  metaAvatar: { width: 18, height: 18, borderRadius: 9, marginRight: 6 },
  metaAvatarPlaceholder: { backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  commentCluster: { fontSize: 12, color: colors.textTertiary, fontFamily: fontFamily.bold },
  
  eventDateBox: { backgroundColor: colors.brandSubtle, padding: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minWidth: 60 },
  eventDateText: { fontSize: 12, fontFamily: fontFamily.extrabold, color: colors.brand, textAlign: 'center' },

  // --- NEW REVIEW STYLES ---
  reviewCard: {
    backgroundColor: colors.white, padding: 16, borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  raterInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  raterAvatar: { width: 36, height: 36, borderRadius: 18 },
  raterName: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.textPrimary },
  reviewDate: { fontSize: 12, color: colors.textTertiary, marginTop: 2, fontFamily: fontFamily.medium },
  starsRow: { flexDirection: 'row', marginTop: 2 },
  reviewComment: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.slate[600], marginTop: 8, lineHeight: 22 },

  emptyLayout: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: colors.textTertiary, fontSize: 14, fontFamily: fontFamily.semibold, marginTop: 12 },

  // FAB
  fabBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  fabMain: {
    position: 'absolute', right: 20, width: 58, height: 58, borderRadius: 29,
    backgroundColor: colors.brand, justifyContent: 'center', alignItems: 'center',
    shadowColor: colors.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  fabMiniWrap: { position: 'absolute', right: 24, flexDirection: 'row', alignItems: 'center' },
  fabMiniLabel: {
    backgroundColor: colors.textPrimary, color: colors.white, fontSize: 12, fontFamily: fontFamily.bold,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginRight: 10, overflow: 'hidden',
  },
  fabMiniButton: {
    width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },

  // Modal Styling
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: fontFamily.extrabold, color: colors.textPrimary },
  
  editAvatarContainer: { alignItems: 'center', marginBottom: 24 },
  editAvatarWrapper: { position: 'relative' },
  editAvatarImage: { width: 100, height: 100, borderRadius: 50 },
  editAvatarBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.accent, width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.white },

  inputLabel: { fontSize: 13, fontFamily: fontFamily.bold, color: colors.textSecondary, marginBottom: 6, marginLeft: 4 },
  inputField: { backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontFamily: fontFamily.regular, fontSize: 15, color: colors.textPrimary, marginBottom: 16 },
  
  saveButton: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: colors.white, fontSize: 16, fontFamily: fontFamily.bold },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.slate[100], paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { fontSize: 13, fontFamily: fontFamily.semibold, color: colors.slate[600] },
  pillTextActive: { color: colors.white }
});
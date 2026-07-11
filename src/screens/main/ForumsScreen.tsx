import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
  ScrollView, Keyboard, TouchableWithoutFeedback, Switch, Share
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';

export default function ForumsScreen({ navigation, route, session: directSession }: any) {
  const session = route?.params?.session || directSession;
  const insets = useSafeAreaInsets();

  // Feed States
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // --- IDENTITY STATE ---
  const [ownedBusinesses, setOwnedBusinesses] = useState<any[]>([]);
  const [postingAsBusinessId, setPostingAsBusinessId] = useState<string | null>(null);

  // Creation / Edit Modal States
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTopic, setNewTopic] = useState('Parties & Celebrations');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [disableComments, setDisableComments] = useState(false);

  // Edit mode 
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const topics = [
    'Parties & Celebrations', 'Weddings', 'Music & Concerts', 'Arts & Entertainment', 
    'Sports & Fitness', 'Business & Networking', 'Education & Learning', 'Technology & Gaming', 
    'Food & Drink', 'Markets & Shopping', 'Community & Charity', 'Religious & Spiritual', 
    'Family & Kids', 'Cultural & Heritage', 'Health & Wellness', 'Outdoor & Nature', 
    'Automotive', 'Pets & Animals', 'Private Events', 'Online & Virtual', 
    'Government & Public Services', 'Other'
  ];

  useFocusEffect(
    useCallback(() => {
      fetchPosts();
      fetchUserBusinesses(); 
    }, [session?.user?.id])
  );

  async function fetchPosts() {
    try {
      if (!refreshing) setLoading(true);
      const { data, error } = await supabase
        .from('forum_posts')
        .select(`
          *,
          author:author_id ( * ),
          business:business_id ( * ),
          likes:forum_likes ( user_id ),
          follows:forum_follows ( user_id ),
          comments:forum_comments ( id )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        const formattedPosts = data.map(post => ({
          ...post,
          likesCount: post.likes.length,
          isLiked: post.likes.some((like: any) => like.user_id === session?.user?.id),
          isFollowing: post.follows.some((follow: any) => follow.user_id === session?.user?.id),
          commentsCount: post.comments ? post.comments.length : 0
        }));
        setPosts(formattedPosts);
      }
    } catch (error: any) {
      console.error("Error fetching posts:", error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchUserBusinesses() {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, logo_url')
        .eq('creator_id', session.user.id);
      
      if (error) throw error;
      if (data) setOwnedBusinesses(data);
    } catch (e: any) {
      console.warn("Failed to fetch owned businesses:", e.message);
    }
  }

  const toggleLike = async (postId: string, currentlyLiked: boolean) => {
    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        return { ...p, isLiked: !currentlyLiked, likesCount: currentlyLiked ? p.likesCount - 1 : p.likesCount + 1 };
      }
      return p;
    }));

    if (currentlyLiked) {
      await supabase.from('forum_likes').delete().match({ post_id: postId, user_id: session.user.id });
    } else {
      await supabase.from('forum_likes').insert({ post_id: postId, user_id: session.user.id });
    }
  };

  const toggleFollow = async (post: any, currentlyFollowing: boolean) => {
    // Optimistic update
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, isFollowing: !currentlyFollowing } : p));

    if (currentlyFollowing) {
      await supabase.from('forum_follows').delete().match({ post_id: post.id, user_id: session.user.id });
    } else {
      await supabase.from('forum_follows').insert({ post_id: post.id, user_id: session.user.id });

      if (post.author_id && post.author_id !== session.user.id) {
        const { error: notifError } = await supabase.from('notifications').insert({
          actor_id: session.user.id,    
          receiver_id: post.author_id,  
          type: 'follow',
          target_id: post.id,           
          is_read: false,
        });
        if (notifError) console.error('Forum follow notification error:', notifError.message);
      }
    }
  };

  async function pickMedia() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera roll access is needed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0].uri) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  }

  async function handlePublishPost() {
    if (!newTitle || !newContent) {
      Alert.alert("Missing Fields", "Please provide a title and content.");
      return;
    }
    try {
      setUploading(true);
      let finalMediaUrl = mediaUri; 
      if (mediaUri && !mediaUri.startsWith('http')) {
        const fileExt = mediaUri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `post-${Date.now()}.${fileExt}`;
        const formData = new FormData();
        formData.append('file', { uri: mediaUri, name: fileName, type: `image/${fileExt}` } as any);
        const { error: uploadError } = await supabase.storage.from('Listings').upload(fileName, formData);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('Listings').getPublicUrl(fileName);
        finalMediaUrl = data.publicUrl;
      }

      if (editingPostId) {
        const { data, error } = await supabase
          .from('forum_posts')
          .update({
            title: newTitle, content: newContent, topic: newTopic, media_url: finalMediaUrl,
            comments_disabled: disableComments, business_id: postingAsBusinessId
          })
          .eq('id', editingPostId)
          .eq('author_id', session.user.id)
          .select(); 
        if (error) throw error;
        if (!data || data.length === 0) { Alert.alert("Rejected", "Database error."); setUploading(false); return; }
      } else {
        const { error } = await supabase.from('forum_posts').insert({
          author_id: session.user.id, business_id: postingAsBusinessId,
          title: newTitle, content: newContent, topic: newTopic, media_url: finalMediaUrl,
          comments_disabled: disableComments
        });
        if (error) throw error;
      }
      setCreateModalVisible(false);
      clearForm();
      fetchPosts();
    } catch (e: any) {
      Alert.alert("Publish Failed", e.message);
    } finally {
      setUploading(false);
    }
  }

  const clearForm = () => {
    setNewTitle(''); setNewContent(''); setMediaUri(null); setMediaType(null);
    setNewTopic('Parties & Celebrations'); setDisableComments(false);
    setEditingPostId(null); setPostingAsBusinessId(null);
  };

  const handleShare = async (title: string, topic: string) => {
    try { await Share.share({ message: `Check out: "${title}" in the ${topic} forum!` }); } catch (e: any) { console.error(e); }
  };

  const handleProfilePress = (item: any) => {
    if (item.business_id && item.business) {
      navigation.navigate('BusinessProfile', { business: item.business, session });
    } else if (item.author_id) {
      if (item.author_id === session?.user?.id) {
        navigation.navigate('Profile', { session });
      } else {
        navigation.navigate('PublicProfile', { userProfile: item.author, session });
      }
    }
  };

  const renderPostCard = ({ item }: { item: any }) => {
    const displayAvatar = item.business?.logo_url || item.author?.avatar_url;
    const displayName = item.business?.name || item.author?.username || 'Community Member';

    return (
      <View style={styles.postCard}>
        {/* HEADER */}
        <View style={styles.postHeader}>
          <TouchableOpacity 
            style={styles.authorRow} 
            activeOpacity={0.7} 
            onPress={() => handleProfilePress(item)}
          >
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.avatarImage} />
            ) : (
              <Ionicons name={item.business ? "briefcase" : "person-circle"} size={40} color="#CBD5E1" />
            )}
            <View style={styles.authorDetails}>
              <Text style={styles.authorName}>{displayName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.postTopicBadge}>{item.topic}</Text>
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            {/* Follow Button */}
            <TouchableOpacity
              style={[styles.followButton, item.isFollowing && styles.followButtonActive]}
              onPress={() => toggleFollow(item, item.isFollowing)}
            >
              <Ionicons
                name={item.isFollowing ? "notifications" : "notifications-outline"}
                size={14}
                color={item.isFollowing ? "#fff" : "#34C759"}
              />
              <Text style={[styles.followText, item.isFollowing && styles.followTextActive]}>
                {item.isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>

            {/* MANAGE BUTTON (Only for Post Author) */}
            {session?.user?.id === item.author_id && (
              <TouchableOpacity 
                style={styles.manageButton} 
                onPress={() => {
                  Alert.alert("Manage", "Options", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Edit", onPress: () => { 
                        setEditingPostId(item.id); setNewTitle(item.title); 
                        setNewContent(item.content); setNewTopic(item.topic); 
                        setMediaUri(item.media_url); setDisableComments(item.comments_disabled); 
                        setPostingAsBusinessId(item.business_id || null); setCreateModalVisible(true); 
                    }},
                    { text: "Delete", style: "destructive", onPress: async () => { 
                        await supabase.from('forum_posts').delete().eq('id', item.id); 
                        fetchPosts(); 
                    }}
                  ]);
                }}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* BODY */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Thread', { post: item, session: session })}>
          <Text style={styles.postTitle}>{item.title}</Text>
          <Text style={styles.postBodyText} numberOfLines={3}>{item.content}</Text>
          {item.media_url && (
            <View style={styles.mediaContainer}>
              <Image source={{ uri: item.media_url }} style={styles.postMedia} />
            </View>
          )}
        </TouchableOpacity>

        {/* FOOTER */}
        <View style={styles.postFooter}>
          <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(item.id, item.isLiked)}>
            <Ionicons name={item.isLiked ? "heart" : "heart-outline"} size={22} color={item.isLiked ? "#EF4444" : "#64748B"} />
            <Text style={styles.actionText}>{item.likesCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Thread', { post: item, session: session })}>
            <Ionicons name="chatbox-outline" size={20} color="#64748B" />
            <Text style={styles.actionText}>{item.commentsCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleShare(item.title, item.topic)}>
            <Ionicons name="share-social-outline" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.navPanel, { paddingTop: Math.max(insets.top, 45) }]}>
        <Text style={styles.navTitle}>Community Forums</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)}>
          <Ionicons name="create-outline" size={26} color="#34C759" />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#34C759" /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPostCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          onRefresh={() => { setRefreshing(true); fetchPosts(); }}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="chatbubbles-outline" size={60} color="#CBD5E1" />
              <Text style={styles.emptyText}>No posts yet. Start a conversation!</Text>
            </View>
          }
        />
      )}

      {/* CREATE / EDIT POST MODAL SHEET */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={() => { setCreateModalVisible(false); clearForm(); }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalContent}
              keyboardVerticalOffset={60}
            >
              <View style={[styles.modalHeader, { marginBottom: 12 }]}>
                <Text style={styles.modalTitle}>{editingPostId ? 'Edit Post' : 'Start a Topic'}</Text>
                <TouchableOpacity onPress={() => { setCreateModalVisible(false); clearForm(); }}>
                  <Ionicons name="close-circle" size={28} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>

                {/* 1. IDENTITY SELECTOR */}
                {ownedBusinesses.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Post As</Text>
                    <View style={{ height: 50 }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <TouchableOpacity 
                          style={[styles.identityPill, postingAsBusinessId === null && styles.identityPillActive]}
                          onPress={() => setPostingAsBusinessId(null)}
                        >
                          <Ionicons name="person-circle" size={24} color={postingAsBusinessId === null ? "#34C759" : "#64748B"} />
                          <Text style={[styles.identityText, postingAsBusinessId === null && styles.identityTextActive]}>My Profile</Text>
                        </TouchableOpacity>
                        {ownedBusinesses.map((biz) => (
                          <TouchableOpacity 
                            key={biz.id}
                            style={[styles.identityPill, postingAsBusinessId === biz.id && styles.identityPillActive]}
                            onPress={() => setPostingAsBusinessId(biz.id)}
                          >
                            {biz.logo_url ? (
                              <Image source={{ uri: biz.logo_url }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                            ) : (
                              <Ionicons name="briefcase" size={24} color={postingAsBusinessId === biz.id ? "#34C759" : "#64748B"} />
                            )}
                            <Text style={[styles.identityText, postingAsBusinessId === biz.id && styles.identityTextActive]}>
                              {biz.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                )}

                {/* 2. TOPIC SELECTOR */}
                <Text style={styles.inputLabel}>Topic Category</Text>
                <FlatList 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  data={topics}
                  style={{ maxHeight: 45, marginBottom: 16 }}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      style={[styles.topicPill, newTopic === item && styles.topicPillActive]}
                      onPress={() => setNewTopic(item)}
                    >
                      <Text style={[styles.topicText, newTopic === item && styles.topicTextActive]}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />

                {/* 3. LABELED INPUTS */}
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput style={styles.titleInput} placeholder="Topic Title..." value={newTitle} onChangeText={setNewTitle} />
                
                <Text style={styles.inputLabel}>Content</Text>
                <TextInput style={styles.bodyInput} placeholder="What's on your mind?" multiline value={newContent} onChangeText={setNewContent} />

                <TouchableOpacity style={styles.mediaSelectorBox} onPress={pickMedia}>
                  {mediaUri ? (
                    <Image source={{ uri: mediaUri }} style={styles.selectedMediaPreview} />
                  ) : (
                    <>
                      <Ionicons name="image" size={32} color="#94A3B8" />
                      <Text style={styles.mediaText}>Attach Photo/Video</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>Disable Comments</Text>
                  </View>
                  <Switch
                    value={disableComments}
                    onValueChange={setDisableComments}
                    trackColor={{ false: '#E2E8F0', true: '#34C759' }}
                    thumbColor="#fff"
                  />
                </View>

                <TouchableOpacity style={styles.publishButton} onPress={handlePublishPost} disabled={uploading}>
                  {uploading ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.publishButtonText}>{editingPostId ? 'Save Changes' : 'Post'}</Text>
                  )}
                </TouchableOpacity>

              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F1F5F9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0'
  },
  navPanel: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 15,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0'
  },
  navTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  postCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8
  },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },
  authorDetails: { marginLeft: 10, flex: 1 },
  authorName: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  postTopicBadge: { fontSize: 11, fontWeight: '700', color: '#3B82F6', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  followButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: '#DCFCE7'
  },
  followButtonActive: { backgroundColor: '#34C759', borderColor: '#34C759' },
  followText: { fontSize: 12, fontWeight: '700', color: '#34C759', marginLeft: 4 },
  followTextActive: { color: '#fff' },
  manageButton: { padding: 5, alignItems: 'center', justifyContent: 'center' },
  postTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  postBodyText: { fontSize: 14, color: '#475569', lineHeight: 22 },
  mediaContainer: {
    width: '100%', height: 200, borderRadius: 12, marginTop: 12,
    overflow: 'hidden', backgroundColor: '#E2E8F0',
    justifyContent: 'center', alignItems: 'center'
  },
  postMedia: { width: '100%', height: '100%', resizeMode: 'cover', position: 'absolute' },
  postFooter: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F1F5F9',
    paddingTop: 12, marginTop: 16
  },
  actionButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginRight: 4 },
  actionText: { fontSize: 13, fontWeight: '600', color: '#64748B', marginLeft: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 28,
    borderTopRightRadius: 28, padding: 24, maxHeight: '90%'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  topicPill: {
    backgroundColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, marginRight: 8, alignSelf: 'flex-start'
  },
  topicPillActive: { backgroundColor: '#3B82F6' },
  topicText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  topicTextActive: { color: '#fff' },
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8 },
  titleInput: {
    fontSize: 18, fontWeight: '700', color: '#1E293B',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
    paddingBottom: 12, marginBottom: 16
  },
  bodyInput: { fontSize: 15, color: '#334155', height: 100, textAlignVertical: 'top', marginBottom: 16 },
  mediaSelectorBox: {
    height: 120, backgroundColor: '#F8FAFC', borderRadius: 16,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#CBD5E1',
    justifyContent: 'center', alignItems: 'center', marginBottom: 24, overflow: 'hidden'
  },
  mediaText: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 8 },
  selectedMediaPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  publishButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  publishButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  identityPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 16,
    backgroundColor: '#F8FAFC', borderRadius: 20,
    marginRight: 10, borderWidth: 1, borderColor: '#E2E8F0',
  },
  identityPillActive: { backgroundColor: '#F0FDF4', borderColor: '#34C759' },
  identityText: { fontSize: 14, fontWeight: '600', color: '#64748B', marginLeft: 8 },
  identityTextActive: { color: '#34C759' },
});
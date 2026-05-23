import React, { useState, useEffect, useCallback } from 'react';

import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Share,
  Switch
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ForumsScreen({ navigation, route, session: directSession }: any) {
  const session = route?.params?.session || directSession;
  const insets = useSafeAreaInsets();

  // Feed States
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Creation / Edit Modal States
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTopic, setNewTopic] = useState('General Discussion');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [disableComments, setDisableComments] = useState(false);

  // Edit mode — null when creating, holds post ID when editing
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const topics = ['General Discussion', 'Farming & Agriculture', 'Tech & IT', 'Vehicles', 'Local News'];

  useFocusEffect(
    useCallback(() => {
      fetchPosts();
    }, [])
  );

  async function fetchPosts() {
    try {
      if (!refreshing) setLoading(true);

      const { data, error } = await supabase
        .from('forum_posts')
        .select(`
          *,
          author:author_id ( username, avatar_url ),
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

  // --- INTERACTION LOGIC ---
  const toggleLike = async (postId: string, currentlyLiked: boolean) => {
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

  const toggleFollow = async (postId: string, currentlyFollowing: boolean) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, isFollowing: !currentlyFollowing } : p));

    if (currentlyFollowing) {
      await supabase.from('forum_follows').delete().match({ post_id: postId, user_id: session.user.id });
    } else {
      await supabase.from('forum_follows').insert({ post_id: postId, user_id: session.user.id });
    }
  };

  

  // --- MEDIA & CREATION LOGIC ---
  async function pickMedia() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera roll access is needed to upload photos or videos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0].uri) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  }

  // Unified create / edit handler — branches on editingPostId
  async function handlePublishPost() {
    if (!newTitle || !newContent) {
      Alert.alert("Missing Fields", "Please provide a title and content.");
      return;
    }

    try {
      setUploading(true);
      
      // If we are editing, mediaUri might already be an HTTP link. 
      // We only want to upload if it's a new local device path.
      let finalMediaUrl = mediaUri; 

      if (mediaUri && !mediaUri.startsWith('http')) {
        const fileExt = mediaUri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `post-${Date.now()}.${fileExt}`;
        const response = await fetch(mediaUri);
        const blob = await response.blob();
        const formData = new FormData();
        
        formData.append('file', { uri: mediaUri, name: fileName, type: `image/${fileExt}` } as any);
        
        const { error: uploadError } = await supabase.storage.from('Listings').upload(fileName, formData);
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('Listings').getPublicUrl(fileName);
        finalMediaUrl = data.publicUrl;
      }

      if (editingPostId) {
        // --- UPDATE EXISTING POST ---
        const { error } = await supabase
          .from('forum_posts')
          .update({
            title: newTitle,
            content: newContent,
            topic: newTopic,
            media_url: finalMediaUrl,
            comments_disabled: disableComments
          })
          .eq('id', editingPostId)
          .eq('author_id', session.user.id); // Extra security check

        if (error) throw error;
        
      } else {
        // --- INSERT NEW POST ---
        const { error } = await supabase.from('forum_posts').insert({
          author_id: session.user.id,
          title: newTitle,
          content: newContent,
          topic: newTopic,
          media_url: finalMediaUrl,
          comments_disabled: disableComments
        });

        if (error) throw error;
      }

      // 1. Close Modal
      setCreateModalVisible(false);
      
      // 2. Wipe the slate clean for the next time
      setNewTitle('');
      setNewContent('');
      setNewTopic('General Discussion');
      setMediaUri(null);
      setMediaType(null);
      setDisableComments(false);
      setEditingPostId(null); 
      
      // 3. Refresh the feed
      fetchPosts();

    } catch (e: any) {
      Alert.alert("Publish Failed", e.message);
    } finally {
      setUploading(false);
    }
  }

  const clearForm = () => {
    setNewTitle('');
    setNewContent('');
    setMediaUri(null);
    setMediaType(null);
    setNewTopic('General Discussion');
    setEditingPostId(null); // Reset edit mode
  };

  // --- NATIVE SHARE FUNCTION ---
  const handleShare = async (title: string, topic: string) => {
    try {
      await Share.share({
        message: `Check out this discussion on Sizana: "${title}" in the ${topic} forum!`,
      });
    } catch (error: any) {
      console.error("Error sharing:", error.message);
    }
  };

  // --- UI RENDERING ---
  const renderPostCard = ({ item }: { item: any }) => (
    <View style={styles.postCard}>
      {/* HEADER */}
      <View style={styles.postHeader}>
        <View style={styles.authorRow}>
          {item.author?.avatar_url ? (
            <Image source={{ uri: item.author.avatar_url }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person-circle" size={40} color="#CBD5E1" />
          )}
          <View style={styles.authorDetails}>
            <Text style={styles.authorName}>{item.author?.username || 'Community Member'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.postTopicBadge}>{item.topic}</Text>
              <Text style={styles.postTime}> • 2h ago</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerActions}>
          {/* FOLLOW / NOTIFY BUTTON (Kept Intact) */}
          <TouchableOpacity 
            style={[styles.followButton, item.isFollowing && styles.followButtonActive]}
            onPress={() => toggleFollow(item.id, item.isFollowing)}
          >
            <Ionicons name={item.isFollowing ? "notifications" : "notifications-outline"} size={14} color={item.isFollowing ? "#fff" : "#34C759"} />
            <Text style={[styles.followText, item.isFollowing && styles.followTextActive]}>
              {item.isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>

          {/* UPGRADED MANAGE BUTTON — only visible to post author */}
          {session?.user?.id === item.author_id && (
            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => {
                Alert.alert("Manage Post", "What would you like to do?", [
                  { text: "Cancel", style: "cancel" },
                  
                  // --- THE EDIT TRIGGER ---
                  { text: "Edit", onPress: () => {
                      setEditingPostId(item.id);               
                      setNewTitle(item.title);                 
                      setNewContent(item.content);             
                      setNewTopic(item.topic);                 
                      setMediaUri(item.media_url);             
                      setDisableComments(item.comments_disabled); 
                      setCreateModalVisible(true);             
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

        {/* MEDIA PREVIEW */}
        {item.media_url && (
          <View style={styles.mediaContainer}>
            <Image source={{ uri: item.media_url }} style={styles.postMedia} />
            {item.media_type === 'video' && (
              <View style={styles.videoOverlay}>
                <Ionicons name="play-circle" size={60} color="rgba(255,255,255,0.9)" />
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>

      {/* FOOTER ACTIONS */}
      <View style={styles.postFooter}>
        <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(item.id, item.isLiked)}>
          <Ionicons name={item.isLiked ? "heart" : "heart-outline"} size={22} color={item.isLiked ? "#EF4444" : "#64748B"} />
          <Text style={[styles.actionText, item.isLiked && { color: '#EF4444' }]}>{item.likesCount > 0 ? item.likesCount : 'Like'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton}
          onPress={() => navigation.navigate('Thread', { post: item, session: session })}
        >
          <Ionicons name="chatbox-outline" size={20} color="#64748B" />
          <Text style={styles.actionText}>{item.commentsCount} Comments</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={() => handleShare(item.title, item.topic)}
        >
          <Ionicons name="arrow-redo-outline" size={22} color="#64748B" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.mainContainer}>

      {/* CUSTOM TOP NAVIGATION PANEL */}
      <View style={styles.navPanel}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          <Text style={styles.navTitle}>Community Forums</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.navIconButton}>
            <Ionicons name="create-outline" size={26} color="#34C759" />
          </TouchableOpacity>
        </View>
      </View>

      {/* POSTS FEED */}
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
        />
      )}

      {/* CREATE / EDIT POST MODAL SHEET */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={() => { setCreateModalVisible(false); clearForm(); }}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              {/* Title changes based on create vs edit mode */}
              <Text style={styles.modalTitle}>{editingPostId ? 'Edit Post' : 'Start a Topic'}</Text>
              <TouchableOpacity onPress={() => { setCreateModalVisible(false); clearForm(); }}>
                <Ionicons name="close-circle" size={28} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* TOPIC SELECTOR PILLS */}
            <FlatList 
              horizontal 
              showsHorizontalScrollIndicator={false}
              data={topics}
              style={{ maxHeight: 45, marginBottom: 16 }}
              renderItem={({item}) => (
                <TouchableOpacity 
                  style={[styles.topicPill, newTopic === item && styles.topicPillActive]}
                  onPress={() => setNewTopic(item)}
                >
                  <Text style={[styles.topicText, newTopic === item && styles.topicTextActive]}>{item}</Text>
                </TouchableOpacity>
              )}
            />

            <TextInput style={styles.titleInput} placeholder="Topic Title..." value={newTitle} onChangeText={setNewTitle} />
            <TextInput style={styles.bodyInput} placeholder="What's on your mind?" multiline value={newContent} onChangeText={setNewContent} />

            {/* MEDIA PREVIEW / SELECTOR */}
            <TouchableOpacity style={styles.mediaSelectorBox} onPress={pickMedia}>
              {mediaUri ? (
                <>
                  <Image source={{ uri: mediaUri }} style={styles.selectedMediaPreview} />
                  {mediaType === 'video' && <Ionicons name="videocam" size={30} color="#fff" style={{ position: 'absolute' }} />}
                </>
              ) : (
                <>
                  <Ionicons name="image" size={32} color="#94A3B8" />
                  <Text style={styles.mediaText}>Attach Photo or Video</Text>
                </>
              )}
            </TouchableOpacity>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>Disable Comments</Text>
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Prevent users from replying to this post.</Text>
              </View>
              <Switch 
                value={disableComments} 
                onValueChange={setDisableComments} 
                trackColor={{ false: '#E2E8F0', true: '#34C759' }}
                thumbColor="#fff"
              />
            </View>
            {/* Button label changes based on mode */}
            <TouchableOpacity style={styles.publishButton} onPress={handlePublishPost} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.publishButtonText}>{editingPostId ? 'Save Changes' : 'Post to Community'}</Text>
              )}
            </TouchableOpacity>

          </KeyboardAvoidingView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F1F5F9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  navPanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 45, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  navTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  navIconButton: { marginLeft: 16, padding: 4 },

  postCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },
  authorDetails: { marginLeft: 10 },
  authorName: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  postTopicBadge: { fontSize: 11, fontWeight: '700', color: '#3B82F6', marginTop: 2 },
  postTime: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  
  followButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#DCFCE7' },
  followButtonActive: { backgroundColor: '#34C759', borderColor: '#34C759' },
  followText: { fontSize: 12, fontWeight: '700', color: '#34C759', marginLeft: 4 },
  followTextActive: { color: '#fff' },

  postTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  postBodyText: { fontSize: 14, color: '#475569', lineHeight: 22 },
  mediaContainer: { width: '100%', height: 200, borderRadius: 12, marginTop: 12, overflow: 'hidden', backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  postMedia: { width: '100%', height: '100%', resizeMode: 'cover', position: 'absolute' },
  videoOverlay: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },

  postFooter: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12, marginTop: 16, justifyContent: 'space-between' },
  actionButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  actionText: { fontSize: 13, fontWeight: '600', color: '#64748B', marginLeft: 6 },

  // Creation Modal Styling
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  
  topicPill: { backgroundColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, alignSelf: 'flex-start' },
  topicPillActive: { backgroundColor: '#3B82F6' },
  topicText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  topicTextActive: { color: '#fff' },

  titleInput: { fontSize: 18, fontWeight: '700', color: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 12, marginBottom: 16 },
  bodyInput: { fontSize: 15, color: '#334155', height: 100, textAlignVertical: 'top', marginBottom: 16 },
  
  mediaSelectorBox: { height: 120, backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', marginBottom: 24, overflow: 'hidden' },
  mediaText: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 8 },
  selectedMediaPreview: { width: '100%', height: '100%', resizeMode: 'cover' },

  publishButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  publishButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  headerActions: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  marginLeft: 8,},

  manageButton: {
  padding: 5,
  alignItems: 'center',
  justifyContent: 'center',}
});
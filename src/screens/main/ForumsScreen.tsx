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
  const [newTags, setNewTags] = useState(''); // PHASE 2: Tags
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

      // 1. Get User Interests
      const { data: userData } = await supabase
        .from('users')
        .select('interests')
        .eq('id', session.user.id)
        .single();

      // 2. Data transformation for RPC
      let interestsArray = [];
      if (userData?.interests) {
        if (Array.isArray(userData.interests)) interestsArray = userData.interests;
        else if (typeof userData.interests === 'string') {
          try { interestsArray = JSON.parse(userData.interests); } 
          catch { interestsArray = userData.interests.split(',').map((t: string) => t.trim()); }
        }
      }

      // 3. Personalized Fetch via RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_personalized_feed', { 
        user_interests_param: interestsArray 
      });

      if (rpcError) throw rpcError;

      if (rpcData && rpcData.length > 0) {
        const postIds = rpcData.map((p: any) => p.id);
        const { data, error } = await supabase
          .from('forum_posts')
          .select(`
            *,
            author:author_id (*),
            business:business_id (*),
            likes:forum_likes ( user_id ),
            follows:forum_follows ( user_id ),
            comments:forum_comments ( id )
          `)
          .in('id', postIds);

        if (error) throw error;

        // Fetch social statuses for authors
        const authorIds = [...new Set(data.map(p => p.author_id).filter(Boolean))];
        const { data: friendData } = await supabase
          .from('user_friends')
          .select('user_id_1, user_id_2')
          .eq('status', 'accepted')
          .or(`user_id_1.in.(${authorIds}),user_id_2.in.(${authorIds})`);
        
        const { data: followerData } = await supabase
          .from('user_followers')
          .select('following_id')
          .eq('follower_id', session.user.id)
          .in('following_id', authorIds);

        const friendSet = new Set(friendData?.flatMap(f => [f.user_id_1, f.user_id_2]).filter(id => id !== session.user.id));
        const followingSet = new Set(followerData?.map(f => f.following_id));

        const formattedPosts = postIds.map((id: string) => {
          const post = data.find(p => p.id === id);
          if (!post) return null;
          return {
            ...post,
            likesCount: post.likes.length,
            isLiked: post.likes.some((like: any) => like.user_id === session?.user?.id),
            isFollowing: post.follows.some((follow: any) => follow.user_id === session?.user?.id),
            isFollowingAuthor: followingSet.has(post.author_id),
            isFriendWithAuthor: friendSet.has(post.author_id),
            commentsCount: post.comments ? post.comments.length : 0
          };
        }).filter(Boolean);
        
        setPosts(formattedPosts);
      } else {
        setPosts([]);
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
      const { data, error } = await supabase.from('businesses').select('id, name, logo_url').eq('creator_id', session.user.id);
      if (error) throw error;
      if (data) setOwnedBusinesses(data);
    } catch (e: any) { console.warn("Failed to fetch owned businesses:", e.message); }
  }

  // --- SOCIAL ACTIONS ---
  const handleAuthorAction = async (authorId: string, type: 'follow' | 'friend') => {
    try {
      if (type === 'follow') {
        await supabase.from('user_followers').insert({ follower_id: session.user.id, following_id: authorId });
        Alert.alert("Success", "You are now following this user.");
      } else {
        await supabase.from('user_friends').insert({ user_id_1: session.user.id, user_id_2: authorId, status: 'pending' });
        Alert.alert("Request Sent", "Friend request sent!");
      }
      fetchPosts();
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const toggleLike = async (postId: string, currentlyLiked: boolean) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, isLiked: !currentlyLiked, likesCount: currentlyLiked ? p.likesCount - 1 : p.likesCount + 1 } : p));
    if (currentlyLiked) await supabase.from('forum_likes').delete().match({ post_id: postId, user_id: session.user.id });
    else await supabase.from('forum_likes').insert({ post_id: postId, user_id: session.user.id });
  };

  // FOLLOW A THREAD (Bell icon) — separate from following a person.
  // Writes to forum_follows keyed by post_id, which is what fetchPosts()
  // and DashboardScreen's "Active Forums" card both read from.
  const toggleFollowPost = async (postId: string, currentlyFollowing: boolean) => {
    // Optimistic UI update — bell reflects the tap immediately
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, isFollowing: !currentlyFollowing } : p));

    try {
      if (currentlyFollowing) {
        const { error } = await supabase
          .from('forum_follows')
          .delete()
          .match({ post_id: postId, user_id: session.user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('forum_follows')
          .insert({ post_id: postId, user_id: session.user.id });
        if (error) throw error;
      }
    } catch (e: any) {
      // Roll back if the write actually failed
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, isFollowing: currentlyFollowing } : p));
      Alert.alert('Error', 'Could not update follow status: ' + e.message);
    }
  };

  const handleConnectPress = (item: any) => {
    // Determine if the entity is a business
    const isBusiness = !!item.business_id;
    const name = item.business?.name || item.author?.username || 'this user';

    Alert.alert(
      "Connect",
      `Connect with ${name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Follow", 
          onPress: () => handleAuthorAction(item.author_id || item.business_id, 'follow') 
        },
        // Spread operator only adds "Add Friend" if it is NOT a business
        ...(!isBusiness ? [{ 
          text: "Add Friend", 
          onPress: () => handleAuthorAction(item.author_id, 'friend') 
        }] : [])
      ]
    );
  };

  async function handlePublishPost() {
    if (!newTitle || !newContent) return Alert.alert("Missing Fields");
    const tagArray = newTags.split(',').map(t => t.trim()).filter(Boolean);
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
        await supabase.from('forum_posts').update({ title: newTitle, content: newContent, topic: newTopic, tags: tagArray, media_url: finalMediaUrl, comments_disabled: disableComments, business_id: postingAsBusinessId }).eq('id', editingPostId);
      } else {
        await supabase.from('forum_posts').insert({ author_id: session.user.id, business_id: postingAsBusinessId, title: newTitle, content: newContent, topic: newTopic, tags: tagArray, media_url: finalMediaUrl, comments_disabled: disableComments });
      }
      setCreateModalVisible(false); clearForm(); fetchPosts();
    } catch (e: any) { Alert.alert("Publish Failed", e.message); } finally { setUploading(false); }
  }

  const formatTimestamp = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
};

  const clearForm = () => {
    setNewTitle(''); setNewContent(''); setMediaUri(null); setNewTags(''); setNewTopic('Parties & Celebrations'); setDisableComments(false); setEditingPostId(null); setPostingAsBusinessId(null);
  };

  const handleProfilePress = (item: any) => {
  if (!item) {
    console.warn("handleProfilePress: item is undefined");
    return;
  }

  // Check if it's a business post
  if (item.business_id && item.business) {
    navigation.navigate('BusinessProfile', { business: item.business, session });
  } 
  // Check if it's a user post
  else if (item.author_id) {
    if (item.author_id === session?.user?.id) {
      navigation.navigate('Profile', { session });
    } else {
      // Ensure item.author exists before navigating
      navigation.navigate('PublicProfile', { userProfile: item.author || { id: item.author_id }, session });
    }
  } else {
    console.warn("handleProfilePress: No author or business ID found on item");
  }
};

  const renderPostCard = useCallback(({ item }: { item: any }) => {
    const displayAvatar = item.business?.logo_url || item.author?.avatar_url;
    const displayName = item.business?.name || item.author?.username || 'Community Member';

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <TouchableOpacity style={styles.authorRow} activeOpacity={0.7} onPress={() => handleProfilePress(item)}>
            {displayAvatar ? <Image source={{ uri: displayAvatar }} style={styles.avatarImage} /> : <Ionicons name={item.business ? "briefcase" : "person-circle"} size={40} color="#CBD5E1" />}
            <View style={styles.authorDetails}>
  {/* Name and Plus Button Container */}
  <View style={styles.nameRow}>
    <Text style={styles.authorName}>{displayName}</Text>
    
    {/* PHASE 3: THE "+" BUTTON */}
    {session?.user?.id !== item.author_id && !item.isFollowingAuthor && !item.isFriendWithAuthor && (
      <TouchableOpacity 
        style={styles.plusButton} 
        onPress={() => {
          const isBusiness = !!item.business_id;
          const targetId = isBusiness ? item.business_id : item.author_id;

          Alert.alert("Connect", `Connect with ${displayName}?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Follow", onPress: () => handleAuthorAction(targetId, 'follow') },
            ...(!isBusiness ? [{ text: "Add Friend", onPress: () => handleAuthorAction(item.author_id, 'friend') }] : [])
          ]);
        }}
      >
        <Ionicons name="add" size={14} color="#fff" />
      </TouchableOpacity>
    )}
  </View>
  
  {/* Metadata Row remains below the name */}
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <Text style={styles.postTopicBadge}>{item.topic}</Text>
    <Text style={styles.postDateText}> • {formatTimestamp(item.created_at)}</Text>
  </View>
</View>
          </TouchableOpacity>

          {/* FOLLOW POST BUTTON (The Bell Icon) */}
          <TouchableOpacity
            style={[styles.followButton, item.isFollowing && styles.followButtonActive]}
            onPress={() => toggleFollowPost(item.id, item.isFollowing)}
          >
            <Ionicons
              name={item.isFollowing ? "notifications" : "notifications-outline"}
              size={16}
              color={item.isFollowing ? "#fff" : "#34C759"}
            />
          </TouchableOpacity>
        </View>

        {/* ... rest of the card (Body, Tags, Footer) remains same ... */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Thread', { post: item, session })}>
          <Text style={styles.postTitle}>{item.title}</Text>
          <Text style={styles.postBodyText} numberOfLines={3}>{item.content}</Text>
          {item.tags && item.tags.length > 0 && (
            <View style={styles.tagContainer}>
              {item.tags.map((tag: string, index: number) => (
                <View key={index} style={styles.tagPill}><Text style={styles.tagText}>#{tag}</Text></View>
              ))}
            </View>
          )}
          {item.media_url && (
            <View style={styles.mediaContainer}>
              <Image source={{ uri: item.media_url }} style={styles.postMedia} />
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.postFooter}>
          <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(item.id, item.isLiked)}>
            <Ionicons name={item.isLiked ? "heart" : "heart-outline"} size={22} color={item.isLiked ? "#EF4444" : "#64748B"} />
            <Text style={styles.actionText}>{item.likesCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Thread', { post: item, session })}>
            <Ionicons name="chatbox-outline" size={20} color="#64748B" />
            <Text style={styles.actionText}>{item.commentsCount}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [session]);

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.navPanel, { paddingTop: Math.max(insets.top, 45) }]}>
        <Text style={styles.navTitle}>Community Forums</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)}><Ionicons name="create-outline" size={26} color="#34C759" /></TouchableOpacity>
      </View>

      <FlatList data={posts} keyExtractor={(item) => String(item.id)} renderItem={renderPostCard} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} onRefresh={() => { setRefreshing(true); fetchPosts(); }} refreshing={refreshing} />

      <Modal animationType="slide" transparent={true} visible={createModalVisible} onRequestClose={() => { setCreateModalVisible(false); clearForm(); }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent} keyboardVerticalOffset={60}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editingPostId ? 'Edit Post' : 'Start a Topic'}</Text>
                <TouchableOpacity onPress={() => { setCreateModalVisible(false); clearForm(); }}><Ionicons name="close-circle" size={28} color="#64748B" /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                <Text style={styles.inputLabel}>Topic Category</Text>
                <FlatList horizontal showsHorizontalScrollIndicator={false} data={topics} style={{ maxHeight: 45, marginBottom: 16 }} keyExtractor={(item) => item} renderItem={({ item }) => (
                  <TouchableOpacity style={[styles.topicPill, newTopic === item && styles.topicPillActive]} onPress={() => setNewTopic(item)}><Text style={[styles.topicText, newTopic === item && styles.topicTextActive]}>{item}</Text></TouchableOpacity>
                )} />
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput style={styles.titleInput} value={newTitle} onChangeText={setNewTitle} />
                <Text style={styles.inputLabel}>Content</Text>
                <TextInput style={styles.bodyInput} multiline value={newContent} onChangeText={setNewContent} />
                <Text style={styles.inputLabel}>Tags (comma separated)</Text>
                <TextInput style={styles.titleInput} placeholder="e.g. Farming, Tech" value={newTags} onChangeText={setNewTags} />
                <TouchableOpacity style={styles.publishButton} onPress={handlePublishPost}><Text style={styles.publishButtonText}>Post</Text></TouchableOpacity>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navPanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  navTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  postCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },
  authorDetails: { marginLeft: 10, flex: 1, justifyContent: 'center' },
  authorName: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  postTopicBadge: { fontSize: 11, fontWeight: '700', color: '#3B82F6', marginTop: 2 },
  plusButton: { backgroundColor: '#34C759', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  postTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  postBodyText: { fontSize: 14, color: '#475569', lineHeight: 22 },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  tagPill: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 6, marginBottom: 4 },
  tagText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  mediaContainer: { width: '100%', height: 200, borderRadius: 12, marginTop: 12, overflow: 'hidden', backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  postMedia: { width: '100%', height: '100%', resizeMode: 'cover' },
  postFooter: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12, marginTop: 16 },
  actionButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginRight: 4 },
  actionText: { fontSize: 13, fontWeight: '600', color: '#64748B', marginLeft: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  topicPill: { backgroundColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  topicPillActive: { backgroundColor: '#3B82F6' },
  topicText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  topicTextActive: { color: '#fff' },
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8 },
  titleInput: { fontSize: 16, color: '#1E293B', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 8, marginBottom: 16 },
  bodyInput: { fontSize: 15, color: '#334155', height: 80, textAlignVertical: 'top', marginBottom: 16 },
  mediaSelectorBox: { height: 100, backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  publishButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  publishButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  identityPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#F8FAFC', borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  identityPillActive: { backgroundColor: '#F0FDF4', borderColor: '#34C759' },
  identityText: { fontSize: 14, fontWeight: '600', color: '#64748B', marginLeft: 8 },
  identityTextActive: { color: '#34C759' },
  postDateText: { 
  fontSize: 11, 
  fontWeight: '600', 
  color: '#94A3B8', 
  marginLeft: 4 
},
followButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginLeft: 8
  },
  followButtonActive: { backgroundColor: '#34C759', borderColor: '#34C759' },
  nameRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 2,
},
});
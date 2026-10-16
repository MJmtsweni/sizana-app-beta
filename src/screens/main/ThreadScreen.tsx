import * as Linking from 'expo-linking';
import { useFocusEffect } from '@react-navigation/native';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, Share 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamily } from '../../theme';
const renderTextWithLinks = (text: string) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <Text key={index} style={{ color: colors.accent, textDecorationLine: 'underline' }} 
              onPress={() => Linking.openURL(part)}>
          {part}
        </Text>
      );
    }
    return <Text key={index}>{part}</Text>;
  });
};

export default function ThreadScreen({ route, navigation }: any) {
  const { post: initialPost, session } = route.params;
  const insets = useSafeAreaInsets();

  const [currentPost, setCurrentPost] = useState(initialPost);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useFocusEffect(
    useCallback(() => {
      async function refreshPostData() {
        try {
          const { data, error } = await supabase
            .from('forum_posts')
            .select(`
              *,
              author:author_id ( * ),
              business:business_id ( * )
            `)
            .eq('id', currentPost.id)
            .single();
            
          if (error) throw error;
          if (data) {
            setCurrentPost(data); 
          }
        } catch (error) {
          console.error("Error refreshing post data:", error);
        }
      }
      
      refreshPostData();
    }, [currentPost.id])
  );

  useEffect(() => {
    fetchComments();
  }, []);

  async function fetchComments() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('forum_comments')
        .select(`
          *,
          author:author_id ( * ),
          likes:forum_comment_likes ( user_id )
        `)
        .eq('post_id', currentPost.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      if (data) {
        const formattedComments = data.map(comment => ({
          ...comment,
          likesCount: comment.likes ? comment.likes.length : 0,
          isLiked: comment.likes ? comment.likes.some((like: any) => like.user_id === session?.user?.id) : false
        }));
        setComments(formattedComments);
      }
    } catch (e: any) {
      Alert.alert('Error loading comments', e.message);
    } finally {
      setLoading(false);
    }
  }

  const handleShareThread = async () => {
    try {
      const deepLink = Linking.createURL(`thread/${currentPost.id}`); 
      await Share.share({
        message: `Check out this discussion on Sizana: "${currentPost.title}"\n\nJoin the conversation here: ${deepLink}`,
      });
    } catch (error: any) {
      console.error("Error sharing thread:", error.message);
    }
  };

  const toggleCommentLike = async (commentId: string, currentlyLiked: boolean) => {
    setComments(prev => prev.map(c => {
      if (c.id === commentId) {
        return { 
          ...c, 
          isLiked: !currentlyLiked, 
          likesCount: currentlyLiked ? c.likesCount - 1 : c.likesCount + 1 
        };
      }
      return c;
    }));

    try {
      if (currentlyLiked) {
        await supabase.from('forum_comment_likes').delete().match({ comment_id: commentId, user_id: session.user.id });
      } else {
        await supabase.from('forum_comment_likes').insert({ comment_id: commentId, user_id: session.user.id });
      }
    } catch (e: any) {
      console.error("Comment like error:", e.message);
    }
  };

  async function handleSendComment() {
    if (currentPost.comments_disabled === true) {
      Alert.alert("Locked", "The author has disabled comments for this post.");
      return;
    }

    if (!newComment.trim() || !session?.user?.id) return;

    let finalContent = newComment.trim();
    if (replyingTo && !editingCommentId) {
      finalContent = `@${replyingTo.author?.username || 'Member'} ${finalContent}`;
    }

    setNewComment('');
    setSubmitting(true);

    try {
      if (editingCommentId) {
        const { error } = await supabase
          .from('forum_comments')
          .update({ content: finalContent })
          .eq('id', editingCommentId)
          .eq('author_id', session.user.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('forum_comments')
          .insert({
            post_id: currentPost.id,
            author_id: session.user.id,
            content: finalContent
          });

        if (error) throw error;
      }
      
      setReplyingTo(null);
      setEditingCommentId(null);
      await fetchComments();
      
      if (!editingCommentId) {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e: any) {
      Alert.alert('Comment Failed', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase.from('forum_comments').delete().eq('id', commentId);
      if (error) throw error;
      fetchComments();
    } catch (e: any) {
      Alert.alert('Delete Failed', e.message);
    }
  };

  const handleProfilePress = (item: any) => {
    if (item.business_id && item.business) {
      navigation.navigate('BusinessProfile', { business: item.business, session });
    } else if (item.author_id && item.author) {
      if (item.author_id === session?.user?.id) {
        navigation.navigate('Profile', { session });
      } else {
        navigation.navigate('PublicProfile', { userProfile: item.author, session });
      }
    }
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
    
    return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
  };

  const renderParentPostHeader = () => {
    const displayAvatar = currentPost.business?.logo_url || currentPost.author?.avatar_url;
    const displayName = currentPost.business?.name || currentPost.author?.username || 'Community Member';

    return (
      <View style={styles.parentPostContainer}>
        <TouchableOpacity 
          style={styles.postHeader} 
          activeOpacity={0.7}
          onPress={() => handleProfilePress(currentPost)}
        >
          {displayAvatar ? (
            <Image source={{ uri: displayAvatar }} style={styles.avatarImage} />
          ) : (
            <Ionicons name={currentPost.business ? "briefcase" : "person-circle"} size={40} color={colors.borderStrong} />
          )}
          <View style={styles.authorDetails}>
            <Text style={styles.authorName}>{displayName}</Text>
            <Text style={styles.postTopicBadge}>{currentPost.topic}</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.postTitle}>{currentPost.title}</Text>
        <Text style={styles.postBodyText}>{currentPost.content}</Text>
        
        {currentPost.media_url && (
          <TouchableOpacity 
            style={styles.mediaContainer} 
            activeOpacity={0.9} 
            onPress={() => setFullScreenImage(currentPost.media_url)}
          >
            <Image source={{ uri: currentPost.media_url }} style={styles.postMedia} />
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          style={styles.opReplyButton} 
          onPress={() => { setEditingCommentId(null); setReplyingTo({ author: currentPost.author }); }}
        >
          <Ionicons name="arrow-undo-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.opReplyText}>Reply to Original Post</Text>
        </TouchableOpacity>

        <View style={styles.divider} />
        <Text style={styles.commentsCountLabel}>Replies ({comments.length})</Text>
      </View>
    );
  };

  const renderCommentItem = ({ item }: { item: any }) => {
    const contentParts = item.content.split(' ');
    const isReply = contentParts[0].startsWith('@');

    return (
      <View style={styles.commentCard}>
        <View style={styles.commentHeader}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            activeOpacity={0.7}
            onPress={() => handleProfilePress(item)}
          >
            {item.author?.avatar_url ? (
              <Image source={{ uri: item.author.avatar_url }} style={styles.commentAvatar} />
            ) : (
              <Ionicons name="person-circle" size={28} color={colors.borderStrong} />
            )}
            <Text style={styles.commentAuthorName}>{item.author?.username || 'Member'}</Text>
            <Text style={styles.commentTime}> • {formatTime(item.created_at)}</Text>
          </TouchableOpacity>

          {/* EDIT/DELETE Dropdown for Comment Authors */}
          {session?.user?.id === item.author_id && (
            <TouchableOpacity 
              style={{ padding: 4 }}
              onPress={() => {
                Alert.alert("Manage Comment", "What would you like to do?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Edit", onPress: () => {
                      setReplyingTo(null);
                      setEditingCommentId(item.id);
                      setNewComment(item.content);
                  }},
                  { text: "Delete", style: "destructive", onPress: () => handleDeleteComment(item.id) }
                ]);
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        
        <Text style={styles.commentBodyText}>
          {isReply ? (
            <>
              <Text style={styles.taggedUserText}>{contentParts[0]} </Text>
              {renderTextWithLinks(contentParts.slice(1).join(' '))}
            </>
          ) : (
            renderTextWithLinks(item.content)
          )}
        </Text>

        {/* Comment Image Handling with Zoom triggers */}
        {item.image_url && (
          <TouchableOpacity 
            style={{ marginLeft: 36, marginTop: 8, borderRadius: 12, overflow: 'hidden', width: 160, height: 160, backgroundColor: colors.slate[100] }}
            onPress={() => setFullScreenImage(item.image_url)}
          >
            <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
          </TouchableOpacity>
        )}

        <View style={styles.commentActionRow}>
          <TouchableOpacity 
            style={styles.commentActionBtn} 
            onPress={() => toggleCommentLike(item.id, item.isLiked)}
          >
            <Ionicons name={item.isLiked ? "heart" : "heart-outline"} size={16} color={item.isLiked ? colors.danger : colors.textTertiary} />
            {item.likesCount > 0 && (
              <Text style={[styles.commentActionText, item.isLiked && { color: colors.danger }]}>
                {item.likesCount}
              </Text>
            )}
          </TouchableOpacity>

          {session?.user?.id !== item.author_id && (
            <TouchableOpacity 
              style={[styles.commentActionBtn, { marginLeft: 16 }]} 
              onPress={() => { setEditingCommentId(null); setReplyingTo(item); }}
            >
              <Text style={styles.replyButtonText}>Reply</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20} 
      style={styles.mainContainer}
    >
      <View style={styles.navPanel}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Discussion Thread</Text>
        <TouchableOpacity onPress={handleShareThread} style={styles.backButton}>
          <Ionicons name="share-social" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.brand} /></View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={renderCommentItem}
          ListHeaderComponent={renderParentPostHeader}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyCommentsLayout}>
              <Text style={styles.emptyCommentsText}>No replies yet. Be the first to join the conversation!</Text>
            </View>
          }
        />
      )}

      {/* Reply Banner Mode */}
      {replyingTo && (
        <View style={styles.replyBanner}>
          <Text style={styles.replyBannerText}>
            Replying to <Text style={{ fontFamily: fontFamily.bold }}>@{replyingTo.author?.username}</Text>
          </Text>
          <TouchableOpacity onPress={() => setReplyingTo(null)}>
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Edit Banner Mode */}
      {editingCommentId && (
        <View style={[styles.replyBanner, { backgroundColor: colors.accentSubtle }]}>
          <Text style={[styles.replyBannerText, { color: colors.blue[700] }]}>
            Editing your comment...
          </Text>
          <TouchableOpacity onPress={() => { setEditingCommentId(null); setNewComment(''); }}>
            <Ionicons name="close-circle" size={20} color={colors.accent} />
          </TouchableOpacity>
        </View>
      )}

      {/* BOTTOM INPUT DOCK */}
      {currentPost.comments_disabled === true ? (
        <View style={[styles.inputDockContainer, { paddingBottom: Math.max(insets.bottom, 12), justifyContent: 'center', alignItems: 'center', paddingVertical: 16 }]}>
          <Ionicons name="lock-closed" size={16} color={colors.textTertiary} />
          <Text style={{ color: colors.textTertiary, fontSize: 14, fontFamily: fontFamily.semibold, marginLeft: 8 }}>
            Comments are disabled by the author.
          </Text>
        </View>
      ) : (
        <View style={[styles.inputDockContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.chatInputField}
            placeholder={replyingTo ? "Write your reply..." : editingCommentId ? "Update your comment..." : "Write a comment..."}
            value={newComment}
            onChangeText={setNewComment}
            placeholderTextColor={colors.textTertiary}
            multiline
          />
          <TouchableOpacity style={styles.sendActionButton} onPress={handleSendComment} disabled={submitting}>
            {submitting ? <ActivityIndicator color={colors.white} size="small" /> : <Ionicons name="send" size={16} color={colors.white} />}
          </TouchableOpacity>
        </View>
      )}

      {/* FULL SCREEN IMAGE MODAL */}
      <Modal 
        visible={!!fullScreenImage} 
        transparent={true} 
        animationType="fade"
        onRequestClose={() => setFullScreenImage(null)} 
      >
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center' }}
          activeOpacity={1}
          onPress={() => setFullScreenImage(null)}
        >
          <TouchableOpacity 
            style={{ position: 'absolute', top: Math.max(insets.top, 50), right: 20, zIndex: 10 }} 
            onPress={() => setFullScreenImage(null)}
          >
            <Ionicons name="close-circle" size={36} color={colors.white} />
          </TouchableOpacity>
          
          <Image 
            source={{ uri: fullScreenImage || '' }} 
            style={{ width: '100%', height: '100%', resizeMode: 'contain' }} 
          />
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: colors.white },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navPanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 60 : 45, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.slate[100], justifyContent: 'center', alignItems: 'center' },
  navTitle: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.textPrimary },
  
  parentPostContainer: { padding: 16, backgroundColor: colors.white },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },
  authorDetails: { marginLeft: 10 },
  authorName: { fontSize: 15, fontFamily: fontFamily.bold, color: colors.textPrimary },
  postTopicBadge: { fontSize: 11, fontFamily: fontFamily.bold, color: colors.accent, marginTop: 2 },
  postTitle: { fontSize: 20, fontFamily: fontFamily.extrabold, color: colors.textPrimary, marginBottom: 8 },
  postBodyText: { fontFamily: fontFamily.regular, fontSize: 15, color: colors.slate[700], lineHeight: 24 },
  mediaContainer: { width: '100%', height: 220, borderRadius: 12, marginTop: 12, overflow: 'hidden' },
  postMedia: { width: '100%', height: '100%', resizeMode: 'cover' },
  
  opReplyButton: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingVertical: 8 },
  opReplyText: { fontSize: 13, fontFamily: fontFamily.semibold, color: colors.textSecondary, marginLeft: 6 },
  
  divider: { height: 1, backgroundColor: colors.border, marginTop: 8, marginBottom: 16 },
  commentsCountLabel: { fontSize: 14, fontFamily: fontFamily.extrabold, color: colors.textSecondary, marginBottom: 4 },
  
  commentCard: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.slate[100] },
  commentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14 },
  commentAuthorName: { fontSize: 13, fontFamily: fontFamily.bold, color: colors.textPrimary, marginLeft: 8 },
  commentTime: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.textTertiary },
  
  commentBodyText: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.slate[700], lineHeight: 20, marginLeft: 36 },
  taggedUserText: { color: colors.accent, fontFamily: fontFamily.semibold },

  commentActionRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 36, marginTop: 8 },
  commentActionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingRight: 8 },
  commentActionText: { fontSize: 12, fontFamily: fontFamily.semibold, color: colors.textTertiary, marginLeft: 4 },
  replyButtonText: { fontSize: 12, fontFamily: fontFamily.bold, color: colors.textSecondary },
  
  emptyCommentsLayout: { alignItems: 'center', padding: 30 },
  emptyCommentsText: { color: colors.textTertiary, fontSize: 13, textAlign: 'center', fontFamily: fontFamily.medium },
  
  replyBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.backgroundMuted, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  replyBannerText: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.slate[600] },
  
  inputDockContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.slate[100], alignItems: 'center', backgroundColor: colors.white },
  chatInputField: { flex: 1, backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 80, color: colors.slate[700], fontFamily: fontFamily.medium },
  sendActionButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand, justifyContent: 'center', alignItems: 'center', marginLeft: 10 }
});
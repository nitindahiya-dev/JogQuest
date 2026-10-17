import { API_BASE_URL } from '../../config/api';
import React, {
  useCallback,
  useState,
} from 'react';

import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Share,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useFocusEffect,
  useNavigation,
} from '@react-navigation/native';
import type {
  CompositeNavigationProp,
} from '@react-navigation/native';
import type {
  BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import type {
  NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {
  MainTabParamList,
  RootStackParamList,
} from '../../navigation/types';

import {useAuth} from '../../auth/AuthContext';

type FeedPost = {
  id: string;
  user_id: string;
  activity_id: string | null;
  content: string;
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  activity_type: 'Run' | 'Walk' | 'Cycle' | null;
  distance_km: number | null;
  elapsed_seconds: number | null;
  pace: string | null;
  started_at: string | null;
  finished_at: string | null;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Feed'>,
  NativeStackNavigationProp<RootStackParamList>
>;



// ─── Design tokens ───
const COLORS = {
  background: '#0A0A0A',
  surface: 'rgba(18, 18, 18, 0.95)',
  surfaceLight: '#171717',
  accent: '#D4FF00',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: 'rgba(255,255,255,0.10)',
  danger: '#FF4D4D',
};

const SPACING = {
  sm: 8,
  md: 16,
  lg: 24,
};

const SocialFeedScreen = () => {
  const {user, token} = useAuth();
  const userId = user?.id;
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [newPost, setNewPost] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  const loadFeed = useCallback(async () => {
    if (!userId) {
      setPosts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      const response = await fetch(
        `${API_BASE_URL}/api/feed/${userId}?scope=all`,
      );
      const data = (await response.json()) as FeedPost[] | {error?: string};

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error ? data.error : 'Failed to load feed',
        );
      }

      setPosts(data as FeedPost[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed]),
  );

  const createPost = async () => {
    const content = newPost.trim();
    if (!userId || !content || posting) return;

    try {
      setPosting(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({userId, content}),
      });

      const data = (await response.json()) as {error?: string};
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to create post');
      }

      setNewPost('');
      await loadFeed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (post: FeedPost) => {
    if (!userId) {
      setError('Please log in to like posts.');
      return;
    }

    try {
      const method = post.liked_by_me ? 'DELETE' : 'POST';
      const response = await fetch(
        `${API_BASE_URL}/api/posts/${post.id}/like/${userId}`,
        {
          method,
          headers: {Authorization: `Bearer ${token}`},
        },
      );

      const data = (await response.json()) as {error?: string};
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to update like');
      }

      setPosts(current =>
        current.map(item =>
          item.id === post.id
            ? {
                ...item,
                liked_by_me: !item.liked_by_me,
                likes_count: item.liked_by_me
                  ? Math.max(item.likes_count - 1, 0)
                  : item.likes_count + 1,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update like');
    }
  };

  const loadComments = async (postId: string) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/posts/${postId}/comments`,
      );
      const data = (await response.json()) as Comment[] | {error?: string};

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error ? data.error : 'Failed to load comments',
        );
      }

      setComments(current => ({
        ...current,
        [postId]: data as Comment[],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    }
  };

  const toggleComments = async (postId: string) => {
    if (activeCommentsPostId === postId) {
      setActiveCommentsPostId(null);
      setCommentText('');
      return;
    }
    setActiveCommentsPostId(postId);
    await loadComments(postId);
  };

  const submitComment = async (postId: string) => {
    const value = commentText.trim();
    if (!userId || !value || commentLoading) return;

    try {
      setCommentLoading(true);
      const response = await fetch(
        `${API_BASE_URL}/api/posts/${postId}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({userId, comment: value}),
        },
      );

      const data = (await response.json()) as Comment | {error?: string};
      if (!response.ok) {
        throw new Error(
          'error' in data && data.error ? data.error : 'Failed to create comment',
        );
      }

      setCommentText('');
      await loadComments(postId);

      setPosts(current =>
        current.map(item =>
          item.id === postId
            ? {...item, comments_count: item.comments_count + 1}
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create comment');
    } finally {
      setCommentLoading(false);
    }
  };

  const startEditingPost = (post: FeedPost) => {
    setError(null);
    setEditingPostId(post.id);
    setEditContent(post.content);
  };

  const savePostEdit = async (post: FeedPost) => {
    const content = editContent.trim();

    if (!content) {
      setError('Post content cannot be empty.');
      return;
    }
    if (content.length > 500 || savingEdit) return;

    try {
      setSavingEdit(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/api/posts/${post.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({content}),
        },
      );

      if (!response.ok) {
        const rawData: unknown = await response.json().catch(() => null);
        const message =
          typeof rawData === 'object' &&
          rawData !== null &&
          'error' in rawData &&
          typeof rawData.error === 'string'
            ? rawData.error
            : 'Failed to update post';
        throw new Error(message);
      }

      setPosts(current =>
        current.map(item =>
          item.id === post.id ? {...item, content} : item,
        ),
      );
      setEditingPostId(null);
      setEditContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update post');
    } finally {
      setSavingEdit(false);
    }
  };

  const sharePost = async (post: FeedPost) => {
    const message = [
      `${post.display_name} (@${post.username}) on JogQuest`,
      post.content,
      post.activity_type
        ? `${post.activity_type}: ${post.distance_km ?? 0} km`
        : '',
    ].filter(Boolean).join('\\n\\n');

    try {
      await Share.share({message});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share post');
    }
  };

  const deletePost = (post: FeedPost) => {
    Alert.alert(
      'Delete post?',
      'This will permanently delete your post and its likes and comments.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(
                `${API_BASE_URL}/api/posts/${post.id}`,
                {
                  method: 'DELETE',
                  headers: {Authorization: `Bearer ${token}`},
                },
              );
              const rawData: unknown = await response.json().catch(() => null);
              const errorMessage =
                typeof rawData === 'object' &&
                rawData !== null &&
                'error' in rawData &&
                typeof rawData.error === 'string'
                  ? rawData.error
                  : 'Failed to delete post';

              if (!response.ok) {
                throw new Error(errorMessage);
              }
              setPosts(current => current.filter(item => item.id !== post.id));
              setComments(current => {
                const next = {...current};
                delete next[post.id];
                return next;
              });
              if (activeCommentsPostId === post.id) {
                setActiveCommentsPostId(null);
                setCommentText('');
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to delete post');
            }
          },
        },
      ],
    );
  };

  const formatTime = (value: string) => {
    const date = new Date(value);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const formatDistance = (value: number | null) => {
    if (typeof value !== 'number') return null;
    return `${value.toFixed(2)}`;
  };

  const formatElapsed = (value: number | null) => {
    if (typeof value !== 'number') return null;
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const renderPost = ({item}: {item: FeedPost}) => {
    const postComments = comments[item.id] ?? [];
    const showComments = activeCommentsPostId === item.id;

    return (
      <View style={styles.postCard}>
        <TouchableOpacity
          style={styles.userRow}
          activeOpacity={0.8}
          onPress={() =>
            navigation.navigate('PublicProfile', {userId: item.user_id})
          }>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.display_name.slice(0, 1).toUpperCase()}
            </Text>
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.displayName}>{item.display_name}</Text>
            <Text style={styles.username}>@{item.username}</Text>
          </View>

          <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
        </TouchableOpacity>

        {editingPostId === item.id ? (
          <View>
            <TextInput
              value={editContent}
              onChangeText={setEditContent}
              placeholder="Edit your post..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={500}
              editable={!savingEdit}
              style={styles.editPostInput}
            />
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editSaveButton}
                onPress={() => savePostEdit(item)}
                disabled={savingEdit || !editContent.trim()}>
                <Text style={styles.editSaveText}>
                  {savingEdit ? 'SAVING...' : 'SAVE'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editCancelButton}
                onPress={() => {
                  setEditingPostId(null);
                  setEditContent('');
                  setError(null);
                }}
                disabled={savingEdit}>
                <Text style={styles.editCancelText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.characterCount}>
              {editContent.length}/500
            </Text>
          </View>
        ) : (
          !!item.content && (
            <Text style={styles.content}>{item.content}</Text>
          )
        )}

        {item.activity_id && item.activity_type && (
          <View style={styles.activityCard}>
            <View style={styles.activityHeader}>
              <Text style={styles.activityType}>
                {item.activity_type.toUpperCase()}
              </Text>
              <Text style={styles.activityLabel}>ACTIVITY</Text>
            </View>

            <View style={styles.activityStats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {formatDistance(item.distance_km) ?? '--'}
                </Text>
                <Text style={styles.statLabel}>KM</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {formatElapsed(item.elapsed_seconds) ?? '--'}
                </Text>
                <Text style={styles.statLabel}>TIME</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.stat}>
                <Text style={styles.statValue}>{item.pace ?? '--'}</Text>
                <Text style={styles.statLabel}>PACE</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => toggleLike(item)}>
            <Text
              style={[
                styles.actionText,
                item.liked_by_me && styles.likedText,
              ]}>
              {item.liked_by_me ? '♥' : '♡'}  {item.likes_count}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => toggleComments(item.id)}>
            <Text style={styles.actionText}>
              💬  {item.comments_count}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => sharePost(item)}>
            <Text style={styles.actionText}>↗ Share</Text>
          </TouchableOpacity>

          {item.user_id === userId && (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => startEditingPost(item)}>
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => deletePost(item)}>
                <Text style={[styles.actionText, {color: COLORS.danger}]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {showComments && (
          <View style={styles.commentsSection}>
            {postComments.length === 0 ? (
              <Text style={styles.noComments}>No comments yet</Text>
            ) : (
              postComments.map(comment => (
                <View key={comment.id} style={styles.commentRow}>
                  <Text style={styles.commentName}>
                    {comment.display_name}
                  </Text>
                  <Text style={styles.commentText}>{comment.comment}</Text>
                </View>
              ))
            )}

            <View style={styles.commentInputRow}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Write a comment..."
                placeholderTextColor={COLORS.textMuted}
                maxLength={500}
                style={styles.commentInput}
              />
              <TouchableOpacity
                style={styles.commentButton}
                onPress={() => submitComment(item.id)}
                disabled={commentLoading}>
                <Text style={styles.commentButtonText}>
                  {commentLoading ? '...' : 'POST'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        renderItem={renderPost}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={COLORS.accent}
            onRefresh={() => {
              setRefreshing(true);
              loadFeed();
            }}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 120,
          },
        ]}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Text style={styles.title}>COMMUNITY</Text>
              <Text style={styles.subtitle}>
                See what the squad is doing
              </Text>
            </View>

            <View style={styles.createCard}>
              <TextInput
                value={newPost}
                onChangeText={setNewPost}
                placeholder="Share an update..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                maxLength={500}
                style={styles.postInput}
              />

              <View style={styles.createFooter}>
                <Text style={styles.characterCount}>
                  {newPost.length}/500
                </Text>

                <TouchableOpacity
                  style={[
                    styles.postButton,
                    !newPost.trim() && styles.postButtonDisabled,
                  ]}
                  onPress={createPost}
                  disabled={posting || !newPost.trim()}>
                  {posting ? (
                    <ActivityIndicator size="small" color={COLORS.background} />
                  ) : (
                    <Text style={styles.postButtonText}>POST</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptyText}>
              Be the first to share something with the community.
            </Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
};

export default SocialFeedScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: SPACING.md,
  },

  header: {
    paddingBottom: 8,
  },
  title: {
    color: COLORS.accent,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 4,
    marginBottom: SPACING.md,
  },

  createCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  postInput: {
    color: COLORS.text,
    fontSize: 15,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  createFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  characterCount: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  postButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    minWidth: 72,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  postButtonDisabled: {
    backgroundColor: '#2A2A2A',
  },
  postButtonText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  errorBox: {
    backgroundColor: 'rgba(255,77,77,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.3)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
  },

  postCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: SPACING.lg,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.background,
    fontSize: 18,
    fontWeight: '900',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  displayName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '800',
  },
  username: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  timestamp: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  editPostInput: {
    color: COLORS.text,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    fontSize: 15,
    minHeight: 90,
    padding: 12,
    marginTop: 14,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  editSaveButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  editSaveText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: '900',
  },
  editCancelButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  editCancelText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
  },

  activityCard: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  activityType: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  activityLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  activityStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },

  actions: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 28,
  },
  actionText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  likedText: {
    color: COLORS.danger,
  },

  commentsSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  noComments: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginBottom: 10,
  },
  commentRow: {
    marginBottom: 10,
  },
  commentName: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
  },
  commentText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  commentInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    color: COLORS.text,
    minHeight: 42,
    paddingHorizontal: 14,
    fontSize: 13,
  },
  commentButton: {
    marginLeft: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  commentButtonText: {
    color: COLORS.background,
    fontSize: 11,
    fontWeight: '900',
  },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    fontSize: 14,
  },
});
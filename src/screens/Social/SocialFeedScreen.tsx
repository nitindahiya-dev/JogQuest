import { API_BASE_URL } from '../../config/api';
import { launchImageLibrary } from 'react-native-image-picker';
import Video from 'react-native-video';
import React, {useCallback,
  useState,
  useRef,
} from 'react';

import {
  Linking,
  ActivityIndicator,
  Image,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Share,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  MainTabParamList,
  RootStackParamList,
} from '../../navigation/types';

import { useAuth } from '../../auth/AuthContext';
import { useJogQuestAlert } from '../../components/JogQuestAlert';
import {
  HeartIcon,
  CommentIcon,
  ShareIcon,
  SendIcon,
  EditIcon,
  TrashIcon,
} from '../../components/Icons';

type FeedPost = {
  id: string;
  user_id: string;
  activity_id: string | null;
  content: string;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
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

type SelectedPostMedia = {
  uri: string;
  name: string;
  type: string;
  fileSize?: number;
  mediaKind: 'image' | 'video';
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
  surface: '#141414',
  surfaceLight: '#1C1C1E',
  accent: '#D4FF00',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: 'rgba(255,255,255,0.08)',
  danger: '#FF4D4D',
};

const SPACING = {
  sm: 8,
  md: 16,
  lg: 24,
};

const SocialFeedScreen = () => {
  const { user, token } = useAuth();
  const userId = user?.id;
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const alert = useJogQuestAlert();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const FEED_PAGE_SIZE = 20;
  const [newPost, setNewPost] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<SelectedPostMedia | null>(null);
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
      setHasMorePosts(false);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      setHasMorePosts(true);

      const response = await fetch(
        `${API_BASE_URL}/api/feed/${userId}?scope=all&limit=${FEED_PAGE_SIZE}&offset=0`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = (await response.json()) as FeedPost[] | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error ? data.error : 'Failed to load feed',
        );
      }

      const firstPage = data as FeedPost[];
      setPosts(firstPage);
      setHasMorePosts(firstPage.length === FEED_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, token]);

  const loadMoreFeed = useCallback(async () => {
    if (
      !userId ||
      !hasMorePosts ||
      loadingMoreRef.current ||
      loading ||
      refreshing
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/feed/${userId}?scope=all&limit=${FEED_PAGE_SIZE}&offset=${posts.length}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = (await response.json()) as FeedPost[] | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error ? data.error : 'Failed to load more posts',
        );
      }

      const nextPage = data as FeedPost[];
      setPosts(current => {
        const existingIds = new Set(current.map(post => post.id));
        return [
          ...current,
          ...nextPage.filter(post => !existingIds.has(post.id)),
        ];
      });
      setHasMorePosts(nextPage.length === FEED_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more posts');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [
    userId,
    token,
    posts.length,
    hasMorePosts,
    loading,
    refreshing,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed]),
  );

  const choosePostMedia = async () => {
    if (posting) return;

    const picker = await launchImageLibrary({
      mediaType: 'mixed',
      selectionLimit: 1,
      videoQuality: 'medium',
      includeExtra: false,
    });

    if (picker.didCancel) return;

    const asset = picker.assets?.[0];
    if (!asset?.uri) {
      alert('Media unavailable', 'Please select another image or video.');
      return;
    }

    const kind = asset.type?.startsWith('video/') ? 'video' : 'image';
    const maxSize = kind === 'video' ? 50 : 10;

    if (asset.fileSize && asset.fileSize > maxSize * 1024 * 1024) {
      alert('Media too large', `Choose a ${kind} smaller than ${maxSize} MB.`);
      return;
    }

    if (
      !['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
        .includes(asset.type || '')
    ) {
      alert('Unsupported media', 'Use JPEG, PNG, WebP, MP4, or MOV.');
      return;
    }

    setSelectedMedia({
      uri: asset.uri,
      name: asset.fileName || `${kind}.${asset.type?.split('/')[1] || (kind === 'video' ? 'mp4' : 'jpg')}`,
      type: asset.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
      fileSize: asset.fileSize,
      mediaKind: kind,
    });
  };

  const createPost = async () => {
    const content = newPost.trim();
    if ((!content && !selectedMedia) || !userId || posting) return;

    try {
      setPosting(true);
      setError(null);

      let body: any;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      if (selectedMedia) {
        const formData = new FormData();
        formData.append('content', content);
        formData.append('media', {
          uri: selectedMedia.uri,
          name: selectedMedia.name,
          type: selectedMedia.type,
        } as any);
        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ userId, content });
      }

      const response = await fetch(`${API_BASE_URL}/api/posts`, {
        method: 'POST',
        headers,
        body,
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create post');
      }

      setNewPost('');
      setSelectedMedia(null);
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
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = (await response.json()) as { error?: string };
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

  const loadComments = async (
    postId: string,
  ): Promise<Comment[] | null> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/posts/${postId}/comments`,
      );
      const data = (await response.json()) as Comment[] | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error ? data.error : 'Failed to load comments',
        );
      }

      const loadedComments = data as Comment[];

      setComments(current => ({
        ...current,
        [postId]: loadedComments,
      }));

      return loadedComments;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
      return null;
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
          body: JSON.stringify({ userId, comment: value }),
        },
      );

      const data = (await response.json()) as Comment | { error?: string };
      if (!response.ok) {
        throw new Error(
          'error' in data && data.error ? data.error : 'Failed to create comment',
        );
      }

      setCommentText('');
      const refreshedComments = await loadComments(postId);

      if (refreshedComments !== null) {
        setPosts(current =>
          current.map(item =>
            item.id === postId
              ? { ...item, comments_count: refreshedComments.length }
              : item,
          ),
        );
      }
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

      const response = await fetch(`${API_BASE_URL}/api/posts/${post.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

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
          item.id === post.id ? { ...item, content } : item,
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
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      await Share.share({ message });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share post');
    }
  };

  const deletePost = (post: FeedPost) => {
    alert(
      'Delete post?',
      'This will permanently delete your post and its likes and comments.',
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'DELETE',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(
                `${API_BASE_URL}/api/posts/${post.id}`,
                {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${token}` },
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
                const next = { ...current };
                delete next[post.id];
                return next;
              });

              if (activeCommentsPostId === post.id) {
                setActiveCommentsPostId(null);
                setCommentText('');
              }
            } catch (err) {
              setError(
                err instanceof Error ? err.message : 'Failed to delete post',
              );
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

  const renderPost = ({ item }: { item: FeedPost }) => {
    const postComments = comments[item.id] ?? [];
    const showComments = activeCommentsPostId === item.id;

    return (
      <View style={styles.postCard}>
        {/* Header */}
        <TouchableOpacity
          style={styles.userRow}
          activeOpacity={0.8}
          onPress={() =>
            navigation.navigate('PublicProfile', { userId: item.user_id })
          }>
          <View style={styles.avatar}>
            {item.avatar_url ? (
              <Image
                source={{ uri: item.avatar_url }}
                style={styles.avatarImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.avatarText}>
                {item.display_name?.slice(0, 1)?.toUpperCase() || '?'}
              </Text>
            )}
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.displayName}>{item.display_name}</Text>
            <Text style={styles.username}>@{item.username}</Text>
          </View>

          <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
        </TouchableOpacity>

        {/* Content / Edit mode */}
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
                style={styles.editCancelButton}
                onPress={() => {
                  setEditingPostId(null);
                  setEditContent('');
                  setError(null);
                }}
                disabled={savingEdit}>
                <Text style={styles.editCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editSaveButton}
                onPress={() => savePostEdit(item)}
                disabled={savingEdit || !editContent.trim()}>
                <Text style={styles.editSaveText}>
                  {savingEdit ? 'SAVING...' : 'SAVE'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.characterCount}>{editContent.length}/500</Text>
          </View>
        ) : (
          !!item.content && <Text style={styles.content}>{item.content}</Text>
        )}

        {item.media_url && item.media_type === 'image' && (
          <Image
            source={{ uri: item.media_url }}
            resizeMode="cover"
            style={{
              width: '100%',
              height: 280,
              borderRadius: 14,
              marginTop: 12,
              backgroundColor: COLORS.surfaceLight,
            }}
          />
        )}
        {item.media_url && item.media_type === 'video' && (
          <View
            style={{
              marginTop: 12,
              height: 240,
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: '#000',
            }}>
            <Video
              source={{ uri: item.media_url }}
              style={{ width: '100%', height: '100%' }}
              controls
              paused
              resizeMode="contain"
              playInBackground={false}
              playWhenInactive={false}
              onError={() => setError('Unable to play this video.')}
            />
          </View>
        )}

        {/* Activity Stats Card */}
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

        {/* ─── Premium Action Bar ─── */}
        <View style={styles.actionBar}>
          <View style={styles.actionBarLeft}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => toggleLike(item)}>
              <HeartIcon
                color={item.liked_by_me ? COLORS.danger : COLORS.textSecondary}
                fill={item.liked_by_me ? COLORS.danger : 'none'}
                size={20}
              />
              <Text
                style={[
                  styles.actionText,
                  item.liked_by_me && styles.likedText,
                ]}>
                {item.likes_count}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => toggleComments(item.id)}>
              <CommentIcon color={COLORS.textSecondary} size={20} />
              <Text style={styles.actionText}>{item.comments_count}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionBarRight}>
            <TouchableOpacity
              style={styles.iconActionButton}
              onPress={() => sharePost(item)}>
              <ShareIcon color={COLORS.textSecondary} size={20} />
            </TouchableOpacity>

            {item.user_id === userId && (
              <>
                <TouchableOpacity
                  style={styles.iconActionButton}
                  onPress={() => startEditingPost(item)}>
                  <EditIcon color={COLORS.textSecondary} size={18} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconActionButton}
                  onPress={() => deletePost(item)}>
                  <TrashIcon color={COLORS.danger} size={18} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Comments */}
        {showComments && (
          <View style={styles.commentsSection}>
            {postComments.length === 0 ? (
              <Text style={styles.noComments}>No comments yet</Text>
            ) : (
              postComments.map(comment => (
                <View key={comment.id} style={styles.commentRow}>
                  <TouchableOpacity
                    style={styles.commentAuthor}
                    activeOpacity={0.8}
                    onPress={() =>
                      navigation.navigate('PublicProfile', {
                        userId: comment.user_id,
                      })
                    }>
                    <View style={styles.commentAvatar}>
                      {comment.avatar_url ? (
                        <Image
                          source={{uri: comment.avatar_url}}
                          style={styles.commentAvatarImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text style={styles.commentAvatarText}>
                          {comment.display_name?.charAt(0)?.toUpperCase() || '?'}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.commentName}>
                      {comment.display_name}
                    </Text>
                  </TouchableOpacity>
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
        onEndReached={loadMoreFeed}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              size="small"
              color={COLORS.accent}
              style={{ paddingVertical: 20 }}
            />
          ) : undefined
        }
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
              <Text style={styles.subtitle}>See what the squad is doing</Text>
            </View>

            {/* Premium Composer with avatar */}
            <View style={styles.createCard}>
              <View style={styles.createTop}>
                <View style={styles.smallAvatar}>
                  <Text style={styles.smallAvatarText}>
                    {user?.display_name?.charAt(0).toUpperCase() || 'N'}
                  </Text>
                </View>
                <TextInput
                  value={newPost}
                  onChangeText={setNewPost}
                  placeholder="Share an update..."
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  maxLength={500}
                  style={styles.postInput}
                />
              </View>

              {selectedMedia && (
                <View style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor: COLORS.surfaceLight,
                }}>
                  {selectedMedia.mediaKind === 'image' ? (
                    <Image
                      source={{ uri: selectedMedia.uri }}
                      resizeMode="cover"
                      style={{ width: '100%', height: 180, borderRadius: 10 }}
                    />
                  ) : (
                    <Text style={{ color: COLORS.accent, padding: 14, fontWeight: '800' }}>
                      VIDEO SELECTED: {selectedMedia.name}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setSelectedMedia(null)}
                    style={{ paddingTop: 10, alignSelf: 'flex-end' }}>
                    <Text style={{ color: COLORS.danger, fontWeight: '800' }}>
                      REMOVE MEDIA
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                onPress={choosePostMedia}
                disabled={posting}
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 10,
                  paddingVertical: 9,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}>
                <Text style={{ color: COLORS.accent, fontWeight: '800' }}>
                  + Attach photo or video
                </Text>
              </TouchableOpacity>

              <View style={styles.createFooter}>
                <Text style={styles.characterCount}>{newPost.length}/500</Text>
                <TouchableOpacity
                  style={[
                    styles.postButton,
                    !newPost.trim() && !selectedMedia && styles.postButtonDisabled,
                  ]}
                  onPress={createPost}
                  disabled={posting || (!newPost.trim() && !selectedMedia)}>
                  {posting ? (
                    <ActivityIndicator size="small" color={COLORS.background} />
                  ) : (
                    <SendIcon color={COLORS.background} size={18} />
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

  // Header
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

  // Composer
  createCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  createTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  smallAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 4,
  },
  smallAvatarText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: '900',
  },
  postInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    minHeight: 60,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postButtonDisabled: {
    backgroundColor: COLORS.surfaceLight,
  },

  // Error
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

  // Post Card
  postCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
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
    fontSize: 16,
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
  content: {
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 4,
    marginBottom: 12,
  },

  // Edit mode
  editPostInput: {
    color: COLORS.text,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    fontSize: 15,
    minHeight: 90,
    padding: 12,
    marginTop: 4,
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

  // Activity Card
  activityCard: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
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
    fontSize: 12,
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

  // ─── Premium Action Bar ───
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionBarLeft: {
    flexDirection: 'row',
    gap: 20,
  },
  actionBarRight: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  likedText: {
    color: COLORS.danger,
  },
  iconActionButton: {
    padding: 4,
  },

  // Comments
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
    marginBottom: 12,
  },
  commentAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  commentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 8,
  },
  commentAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
  },
  commentAvatarText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: '900',
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

  // Empty state
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
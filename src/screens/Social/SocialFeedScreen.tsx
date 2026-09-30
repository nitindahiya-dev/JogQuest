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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useFocusEffect,
} from '@react-navigation/native';

type FeedPost = {
  id: string;

  user_id: string;

  activity_id: string | null;

  content: string;

  created_at: string;

  username: string;

  display_name: string;

  avatar_url: string | null;

  activity_type:
    | 'Run'
    | 'Walk'
    | 'Cycle'
    | null;

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

const API_BASE_URL =
  'http://127.0.0.1:4000';

const DEV_USER_ID =
  '7445aab6-039b-4e64-8559-1ec9ae702ffe';

const SocialFeedScreen = () => {
  const [
    posts,
    setPosts,
  ] = useState<FeedPost[]>([]);

  const [
    newPost,
    setNewPost,
  ] = useState('');

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    posting,
    setPosting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    activeCommentsPostId,
    setActiveCommentsPostId,
  ] = useState<string | null>(null);

  const [
    comments,
    setComments,
  ] = useState<
    Record<string, Comment[]>
  >({});

  const [
    commentText,
    setCommentText,
  ] = useState('');

  const [
    commentLoading,
    setCommentLoading,
  ] = useState(false);

  const loadFeed = useCallback(
    async () => {
      try {
        setError(null);

        const response =
          await fetch(
            `${API_BASE_URL}/api/feed/${DEV_USER_ID}?scope=all`,
          );

        const data =
          (await response.json()) as
            | FeedPost[]
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            'error' in data && data.error
              ? data.error
              : 'Failed to load feed',
          );
        }

        setPosts(
          data as FeedPost[],
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load feed',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed]),
  );

  const createPost = async () => {
    const content =
      newPost.trim();

    if (!content || posting) {
      return;
    }

    try {
      setPosting(true);
      setError(null);

      const response =
        await fetch(
          `${API_BASE_URL}/api/posts`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              userId: DEV_USER_ID,
              content,
            }),
          },
        );

      const data =
        (await response.json()) as {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Failed to create post',
        );
      }

      setNewPost('');

      await loadFeed();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to create post',
      );
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (
    post: FeedPost,
  ) => {
    try {
      const method =
        post.liked_by_me
          ? 'DELETE'
          : 'POST';

      const response =
        await fetch(
          `${API_BASE_URL}/api/posts/${post.id}/like/${DEV_USER_ID}`,
          {
            method,
          },
        );

      const data =
        (await response.json()) as {
          error?: string;
        };

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Failed to update like',
        );
      }

      setPosts(
        current =>
          current.map(item =>
            item.id === post.id
              ? {
                  ...item,
                  liked_by_me:
                    !item.liked_by_me,
                  likes_count:
                    item.liked_by_me
                      ? Math.max(
                          item.likes_count - 1,
                          0,
                        )
                      : item.likes_count + 1,
                }
              : item,
          ),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to update like',
      );
    }
  };

  const loadComments = async (
    postId: string,
  ) => {
    try {
      const response =
        await fetch(
          `${API_BASE_URL}/api/posts/${postId}/comments`,
        );

      const data =
        (await response.json()) as
          | Comment[]
          | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error
            ? data.error
            : 'Failed to load comments',
        );
      }

      setComments(
        current => ({
          ...current,
          [postId]:
            data as Comment[],
        }),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to load comments',
      );
    }
  };

  const toggleComments = async (
    postId: string,
  ) => {
    if (
      activeCommentsPostId ===
      postId
    ) {
      setActiveCommentsPostId(
        null,
      );
      setCommentText('');
      return;
    }

    setActiveCommentsPostId(
      postId,
    );

    await loadComments(postId);
  };

  const submitComment = async (
    postId: string,
  ) => {
    const value =
      commentText.trim();

    if (!value || commentLoading) {
      return;
    }

    try {
      setCommentLoading(true);

      const response =
        await fetch(
          `${API_BASE_URL}/api/posts/${postId}/comments`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              userId: DEV_USER_ID,
              comment: value,
            }),
          },
        );

      const data =
        (await response.json()) as
          | Comment
          | { error?: string };

      if (!response.ok) {
        throw new Error(
          'error' in data && data.error
            ? data.error
            : 'Failed to create comment',
        );
      }

      setCommentText('');

      await loadComments(postId);

      setPosts(
        current =>
          current.map(item =>
            item.id === postId
              ? {
                  ...item,
                  comments_count:
                    item.comments_count + 1,
                }
              : item,
          ),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to create comment',
      );
    } finally {
      setCommentLoading(false);
    }
  };

  const formatTime = (
    value: string,
  ) => {
    return new Date(
      value,
    ).toLocaleString();
  };

  const formatDistance = (
    value: number | null,
  ) => {
    if (
      typeof value !==
      'number'
    ) {
      return null;
    }

    return `${value.toFixed(2)} km`;
  };

  const formatElapsed = (
    value: number | null,
  ) => {
    if (
      typeof value !==
      'number'
    ) {
      return null;
    }

    const minutes =
      Math.floor(value / 60);

    const seconds =
      value % 60;

    return `${minutes}:${String(
      seconds,
    ).padStart(2, '0')}`;
  };

  const renderPost = ({
    item,
  }: {
    item: FeedPost;
  }) => {
    const postComments =
      comments[item.id] ?? [];

    const showComments =
      activeCommentsPostId ===
      item.id;

    return (
      <View style={styles.postCard}>

        <View style={styles.userRow}>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.display_name
                .slice(0, 1)
                .toUpperCase()}
            </Text>
          </View>

          <View style={styles.userInfo}>

            <Text style={styles.displayName}>
              {item.display_name}
            </Text>

            <Text style={styles.username}>
              @{item.username}
            </Text>

          </View>

        </View>

        {!!item.content && (
          <Text style={styles.content}>
            {item.content}
          </Text>
        )}

        {item.activity_id &&
          item.activity_type && (
            <View style={styles.activityCard}>

              <View style={styles.activityHeader}>
                <Text style={styles.activityType}>
                  {item.activity_type}
                </Text>

                <Text style={styles.activityLabel}>
                  ACTIVITY
                </Text>
              </View>

              <View style={styles.activityStats}>

                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {formatDistance(
                      item.distance_km,
                    ) ?? '--'}
                  </Text>

                  <Text style={styles.statLabel}>
                    DISTANCE
                  </Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {formatElapsed(
                      item.elapsed_seconds,
                    ) ?? '--'}
                  </Text>

                  <Text style={styles.statLabel}>
                    TIME
                  </Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {item.pace ?? '--'}
                  </Text>

                  <Text style={styles.statLabel}>
                    PACE
                  </Text>
                </View>

              </View>

            </View>
          )}

        <Text style={styles.timestamp}>
          {formatTime(
            item.created_at,
          )}
        </Text>

        <View style={styles.actions}>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              toggleLike(item)
            }>

            <Text
              style={[
                styles.actionText,
                item.liked_by_me &&
                  styles.likedText,
              ]}>
              {item.liked_by_me
                ? 'LIKED'
                : 'LIKE'}
            </Text>

            <Text style={styles.actionCount}>
              {item.likes_count}
            </Text>

          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              toggleComments(item.id)
            }>

            <Text style={styles.actionText}>
              COMMENTS
            </Text>

            <Text style={styles.actionCount}>
              {item.comments_count}
            </Text>

          </TouchableOpacity>

        </View>

        {showComments && (
          <View style={styles.commentsSection}>

            {postComments.length === 0 ? (
              <Text style={styles.noComments}>
                No comments yet.
              </Text>
            ) : (
              postComments.map(comment => (
                <View
                  key={comment.id}
                  style={styles.commentRow}>

                  <Text
                    style={styles.commentName}>
                    {comment.display_name}
                  </Text>

                  <Text
                    style={styles.commentText}>
                    {comment.comment}
                  </Text>

                </View>
              ))
            )}

            <View style={styles.commentInputRow}>

              <TextInput
                value={commentText}
                onChangeText={
                  setCommentText
                }
                placeholder="Write a comment..."
                placeholderTextColor="#555"
                maxLength={500}
                style={styles.commentInput}
              />

              <TouchableOpacity
                style={styles.commentButton}
                onPress={() =>
                  submitComment(item.id)
                }
                disabled={commentLoading}>

                <Text style={styles.commentButtonText}>
                  POST
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
        <ActivityIndicator
          size="large"
          color="#fff"
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }>

      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        renderItem={renderPost}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#fff"
            onRefresh={() => {
              setRefreshing(true);
              loadFeed();
            }}
          />
        }
        contentContainerStyle={
          styles.listContent
        }

        ListHeaderComponent={
          <View>

            <View style={styles.header}>
              <View>
                <Text style={styles.title}>
                  Social Feed
                </Text>

                <Text style={styles.subtitle}>
                  See what the community is doing
                </Text>
              </View>
            </View>

            <View style={styles.createCard}>

              <TextInput
                value={newPost}
                onChangeText={setNewPost}
                placeholder="Share an update..."
                placeholderTextColor="#555"
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
                    !newPost.trim() &&
                      styles.postButtonDisabled,
                  ]}
                  onPress={createPost}
                  disabled={
                    posting ||
                    !newPost.trim()
                  }>

                  {posting ? (
                    <ActivityIndicator
                      size="small"
                      color="#000"
                    />
                  ) : (
                    <Text style={styles.postButtonText}>
                      POST
                    </Text>
                  )}

                </TouchableOpacity>

              </View>

            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  {error}
                </Text>
              </View>
            )}

          </View>
        }

        ListEmptyComponent={
          <View style={styles.empty}>

            <Text style={styles.emptyTitle}>
              No posts yet
            </Text>

            <Text style={styles.emptyText}>
              Create the first post and
              start the community feed.
            </Text>

          </View>
        }
      />

    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },

  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 30,
  },

  header: {
    paddingTop: 22,
    paddingBottom: 16,
  },

  title: {
    color: '#fff',
    fontSize: 25,
    fontWeight: '900',
  },

  subtitle: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },

  createCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },

  postInput: {
    minHeight: 85,
    color: '#fff',
    fontSize: 14,
    textAlignVertical: 'top',
  },

  createFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },

  characterCount: {
    color: '#555',
    fontSize: 10,
  },

  postButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    minWidth: 70,
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
  },

  postButtonDisabled: {
    backgroundColor: '#333',
  },

  postButtonText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
  },

  errorBox: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },

  errorText: {
    color: '#aaa',
    fontSize: 12,
  },

  postCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
  },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '900',
  },

  userInfo: {
    marginLeft: 11,
  },

  displayName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  username: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },

  content: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },

  activityCard: {
    backgroundColor: '#171717',
    borderRadius: 13,
    padding: 13,
    marginTop: 13,
    borderWidth: 1,
    borderColor: '#292929',
  },

  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  activityType: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },

  activityLabel: {
    color: '#666',
    fontSize: 9,
    fontWeight: '800',
  },

  activityStats: {
    flexDirection: 'row',
    marginTop: 14,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },

  statLabel: {
    color: '#555',
    fontSize: 8,
    fontWeight: '700',
    marginTop: 4,
  },

  statDivider: {
    width: 1,
    backgroundColor: '#292929',
  },

  timestamp: {
    color: '#555',
    fontSize: 10,
    marginTop: 13,
  },

  actions: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },

  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 25,
  },

  actionText: {
    color: '#888',
    fontSize: 10,
    fontWeight: '900',
  },

  likedText: {
    color: '#fff',
  },

  actionCount: {
    color: '#555',
    fontSize: 10,
    marginLeft: 5,
  },

  commentsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },

  noComments: {
    color: '#555',
    fontSize: 11,
    marginBottom: 10,
  },

  commentRow: {
    marginBottom: 9,
  },

  commentName: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  commentText: {
    color: '#999',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },

  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },

  commentInput: {
    flex: 1,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#292929',
    borderRadius: 10,
    color: '#fff',
    minHeight: 40,
    paddingHorizontal: 11,
    fontSize: 12,
  },

  commentButton: {
    marginLeft: 7,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },

  commentButtonText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
  },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 70,
    paddingHorizontal: 30,
  },

  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  emptyText: {
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
});

export default SocialFeedScreen;

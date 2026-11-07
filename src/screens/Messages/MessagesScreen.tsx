import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '../../auth/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme';

type Conversation = {
  id: string;
  other_user_id: string;
  other_username: string;
  other_display_name: string | null;
  other_avatar_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_muted?: boolean;
  is_archived?: boolean;
};

type InboxView = 'inbox' | 'archived';

const MessagesScreen = () => {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [view, setView] = useState<InboxView>('inbox');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const conversationsRequestRef = useRef(0);

  const loadConversations = useCallback(async (refresh = false) => {
    if (!token) {
      setLoading(false);
      setError('Please sign in again to view messages.');
      return;
    }

    const requestId = ++conversationsRequestRef.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      setError('');
      const response = await fetch(
        `${API_BASE_URL}/api/messages/conversations?view=${view}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        conversations?: Conversation[];
      };

      if (!response.ok) {
        throw new Error(data.error || 'Could not load conversations.');
      }

      if (requestId !== conversationsRequestRef.current) return;
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } catch (e) {
      if (requestId !== conversationsRequestRef.current) return;
      setError(e instanceof Error ? e.message : 'Could not load messages.');
    } finally {
      if (requestId === conversationsRequestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token, view]);

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
      if (!token) return undefined;

      const socket: Socket = io(API_BASE_URL, {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });

      const refreshInbox = () => {
        void loadConversations(true);
      };

      // Reconcile the inbox after initial connection and every reconnect.
      socket.on('connect', refreshInbox);
      // This event is emitted to the recipient's user room for every new message,
      // including when an in-app notification is suppressed for an active chat.
      socket.on('conversation:updated', refreshInbox);
      socket.on('conversation:settings-updated', refreshInbox);
      socket.on('conversation:hidden', refreshInbox);

      return () => {
        conversationsRequestRef.current += 1;
        socket.removeAllListeners();
        socket.disconnect();
      };
    }, [loadConversations, token]),
  );

  const openConversation = (item: Conversation) => {
    navigation.navigate('Chat', {
      conversationId: item.id,
      otherUserId: item.other_user_id,
      otherUsername: item.other_username,
      otherDisplayName: item.other_display_name || item.other_username,
      otherAvatarUrl: item.other_avatar_url,
    });
  };

  const updateConversation = async (
    item: Conversation,
    changes: { muted?: boolean; archived?: boolean },
  ) => {
    if (!token || busyId) return;
    setBusyId(item.id);
    setError('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/messages/conversations/${item.id}/settings`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(changes),
        },
      );
      const data = await response.json().catch(() => ({})) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Could not update conversation.');
      }
      await loadConversations(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update conversation.');
    } finally {
      setBusyId(null);
    }
  };

  const hideConversation = async (item: Conversation) => {
    if (!token || busyId) return;
    setBusyId(item.id);
    setError('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/messages/conversations/${item.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json().catch(() => ({})) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Could not remove conversation.');
      }
      setConversations(current => current.filter(conversation => conversation.id !== item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove conversation.');
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString() === new Date().toLocaleDateString()
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.muted}>Loading messages…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <View>
          <Text style={styles.eyebrow}>YOUR COMMUNITY</Text>
          <Text style={styles.title}>Messages</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => loadConversations(true)}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshText}>REFRESH</Text>
        </Pressable>
      </View>

      <View style={styles.viewTabs}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: view === 'inbox' }}
          onPress={() => setView('inbox')}
          style={[styles.viewTab, view === 'inbox' && styles.viewTabActive]}
        >
          <Text style={[styles.viewTabText, view === 'inbox' && styles.viewTabTextActive]}>
            INBOX
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: view === 'archived' }}
          onPress={() => setView('archived')}
          style={[styles.viewTab, view === 'archived' && styles.viewTabActive]}
        >
          <Text style={[styles.viewTabText, view === 'archived' && styles.viewTabTextActive]}>
            ARCHIVED
          </Text>
        </Pressable>
      </View>

      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      )}

      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadConversations(true)}
            tintColor={COLORS.accent}
          />
        }
        contentContainerStyle={conversations.length ? styles.list : styles.emptyList}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{error ? '!' : '✉'}</Text>
            <Text style={styles.emptyTitle}>
              {error
                ? 'Could not load conversations'
                : view === 'archived' ? 'No archived conversations' : 'No conversations yet'}
            </Text>
            <Text style={styles.muted}>
              {error
                ? 'Something went wrong while loading your messages. Please try again.'
                : view === 'archived'
                  ? 'Conversations you archive will appear here.'
                  : 'Open another runner’s profile and tap Message to start a conversation.'}
            </Text>
            {!!error && (
              <Pressable
                accessibilityRole="button"
                onPress={() => loadConversations()}
                style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>TRY AGAIN</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const displayName = item.other_display_name || item.other_username || 'Runner';
          const busy = busyId === item.id;

          return (
            <View style={styles.conversation}>
              <Pressable
                onPress={() => openConversation(item)}
                style={({ pressed }) => [styles.conversationMain, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Message ${displayName}`}
              >
                <View style={styles.avatar}>
                  {item.other_avatar_url ? (
                    <Image
                      source={{ uri: item.other_avatar_url }}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.avatarText}>
                      {displayName.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.conversationBody}>
                  <View style={styles.row}>
                    <Text numberOfLines={1} style={styles.name}>{displayName}</Text>
                    <Text style={styles.time}>{formatDate(item.last_message_at)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text numberOfLines={1} style={styles.preview}>
                      {item.last_message || `@${item.other_username}`}
                    </Text>
                    {Number(item.unread_count) > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>
                          {Number(item.unread_count) > 99 ? '99+' : item.unread_count}
                        </Text>
                      </View>
                    )}
                  </View>
                  {(item.is_muted || item.is_archived) && (
                    <Text style={styles.statusText}>
                      {item.is_muted ? 'MUTED' : ''}
                      {item.is_muted && item.is_archived ? '  ·  ' : ''}
                      {item.is_archived ? 'ARCHIVED' : ''}
                    </Text>
                  )}
                </View>
              </Pressable>

              <View style={styles.rowActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => updateConversation(item, { muted: !item.is_muted })}
                  style={[styles.actionButton, busy && styles.disabled]}
                >
                  <Text style={styles.actionText}>
                    {item.is_muted ? 'UNMUTE' : 'MUTE'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => updateConversation(item, { archived: !item.is_archived })}
                  style={[styles.actionButton, busy && styles.disabled]}
                >
                  <Text style={styles.actionText}>
                    {item.is_archived ? 'UNARCHIVE' : 'ARCHIVE'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => hideConversation(item)}
                  style={[styles.actionButton, styles.removeButton, busy && styles.disabled]}
                >
                  <Text style={styles.removeText}>REMOVE</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.md },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  eyebrow: { ...TYPOGRAPHY.label, color: COLORS.accent, fontSize: 10, letterSpacing: 1.5 },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text, marginTop: 4 },
  refreshButton: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  refreshText: { ...TYPOGRAPHY.label, color: COLORS.accent, fontSize: 10 },
  viewTabs: { flexDirection: 'row', gap: 10, marginBottom: SPACING.md },
  viewTab: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border },
  viewTabActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  viewTabText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 11 },
  viewTabTextActive: { color: COLORS.background },
  retryButton: { marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 11 },
  retryText: { ...TYPOGRAPHY.label, color: COLORS.accent, fontSize: 11 },
  list: { paddingBottom: 30 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: SPACING.lg },
  emptyIcon: { fontSize: 38, color: COLORS.accent, marginBottom: SPACING.md },
  emptyTitle: { ...TYPOGRAPHY.h2, color: COLORS.text, marginBottom: SPACING.sm },
  muted: { ...TYPOGRAPHY.body, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm },
  error: { ...TYPOGRAPHY.body, color: COLORS.danger, marginBottom: SPACING.md },
  conversation: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  conversationMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.7 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: COLORS.background, fontSize: 19, fontWeight: '900' },
  conversationBody: { flex: 1, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { ...TYPOGRAPHY.h3, color: COLORS.text, flex: 1 },
  time: { ...TYPOGRAPHY.body, color: COLORS.textMuted, fontSize: 11 },
  preview: { ...TYPOGRAPHY.body, color: COLORS.textMuted, flex: 1, fontSize: 13 },
  statusText: { color: COLORS.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9, marginLeft: 60 },
  actionButton: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  actionText: { color: COLORS.textMuted, fontSize: 9, fontWeight: '800' },
  removeButton: { borderColor: COLORS.danger },
  removeText: { color: COLORS.danger, fontSize: 9, fontWeight: '800' },
  disabled: { opacity: 0.4 },
  unreadBadge: { minWidth: 21, height: 21, borderRadius: 11, paddingHorizontal: 5, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: COLORS.background, fontSize: 10, fontWeight: '900' },
});

export default MessagesScreen;

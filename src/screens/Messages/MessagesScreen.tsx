import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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
};

const MessagesScreen = () => {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadConversations = useCallback(async (refresh = false) => {
    if (!token) {
      setLoading(false);
      setError('Please sign in again to view messages.');
      return;
    }

    if (refresh) setRefreshing(true);
    else setLoading(true);

    try {
      setError('');
      const response = await fetch(
        `${API_BASE_URL}/api/messages/conversations`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not load conversations.');
      }

      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations]),
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
            <Text style={styles.emptyIcon}>✉</Text>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.muted}>
              Open another runner’s profile and tap Message to start a conversation.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const displayName = item.other_display_name || item.other_username || 'Runner';
          return (
            <Pressable
              onPress={() => openConversation(item)}
              style={({ pressed }) => [styles.conversation, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Message ${displayName}`}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
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
              </View>
            </Pressable>
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
  list: { paddingBottom: 30 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: SPACING.lg },
  emptyIcon: { fontSize: 38, color: COLORS.accent, marginBottom: SPACING.md },
  emptyTitle: { ...TYPOGRAPHY.h2, color: COLORS.text, marginBottom: SPACING.sm },
  muted: { ...TYPOGRAPHY.body, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm },
  error: { ...TYPOGRAPHY.body, color: COLORS.danger, marginBottom: SPACING.md },
  conversation: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 },
  pressed: { opacity: 0.7 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.background, fontSize: 19, fontWeight: '900' },
  conversationBody: { flex: 1, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { ...TYPOGRAPHY.h3, color: COLORS.text, flex: 1 },
  time: { ...TYPOGRAPHY.body, color: COLORS.textMuted, fontSize: 11 },
  preview: { ...TYPOGRAPHY.body, color: COLORS.textMuted, flex: 1, fontSize: 13 },
  unreadBadge: { minWidth: 21, height: 21, borderRadius: 11, paddingHorizontal: 5, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: COLORS.background, fontSize: 10, fontWeight: '900' },
});

export default MessagesScreen;

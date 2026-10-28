import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useAuth } from '../../auth/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme';
import { useJogQuestAlert } from '../../components/JogQuestAlert';

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

const ChatScreen = () => {
  const { user, token } = useAuth();
  const alert = useJogQuestAlert();
  const route = useRoute<any>();
  const {
    conversationId,
    otherUserId,
    otherUsername,
    otherDisplayName,
    otherAvatarUrl,
  } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [blockStatus, setBlockStatus] = useState<{
    blockedByMe: boolean;
    blockedMe: boolean;
  } | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);

  const loadMessages = useCallback(async () => {
    if (!token || !conversationId) {
      setLoading(false);
      setError('Missing sign-in or conversation information.');
      return;
    }

    try {
      setError('');
      const response = await fetch(
        `${API_BASE_URL}/api/messages/conversations/${conversationId}/messages`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not load messages.');
      }
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, [conversationId, token]);

  const loadBlockStatus = useCallback(async () => {
    if (!token || !otherUserId) {
      setBlockStatus(null);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/messages/blocks/${otherUserId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not load block status.');
      }

      setBlockStatus({
        blockedByMe: data.blockedByMe === true,
        blockedMe: data.blockedMe === true,
      });
    } catch (e) {
      setBlockStatus(null);
      setError(e instanceof Error ? e.message : 'Could not load block status.');
    }
  }, [otherUserId, token]);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
      loadBlockStatus();
    }, [loadMessages, loadBlockStatus]),
  );

  const changeBlockStatus = async () => {
    if (!token || !otherUserId || blockBusy || !blockStatus) return;

    const currentlyBlocked = blockStatus.blockedByMe;
    const action = currentlyBlocked ? 'unblock' : 'block';

    alert(
      currentlyBlocked ? 'Unblock runner?' : 'Block runner?',
      currentlyBlocked
        ? `Allow ${otherDisplayName || otherUsername || 'this runner'} to message you again?`
        : `You and ${otherDisplayName || otherUsername || 'this runner'} will not be able to message each other while the block applies.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: currentlyBlocked ? 'Unblock' : 'Block',
          style: currentlyBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setBlockBusy(true);
            setError('');

            try {
              const response = await fetch(
                `${API_BASE_URL}/api/messages/blocks/${otherUserId}`,
                {
                  method: currentlyBlocked ? 'DELETE' : 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                },
              );
              const data = await response.json().catch(() => ({}));

              if (!response.ok) {
                throw new Error(data.error || `Could not ${action} runner.`);
              }

              setBlockStatus({
                blockedByMe: !currentlyBlocked,
                blockedMe: blockStatus.blockedMe,
              });

              alert(
                currentlyBlocked ? 'Runner unblocked' : 'Runner blocked',
                currentlyBlocked
                  ? 'You have unblocked this runner.'
                  : 'This runner has been blocked.',
              );
            } catch (e) {
              const message = e instanceof Error
                ? e.message
                : `Could not ${action} runner.`;
              setError(message);
              alert('Action failed', message);
              await loadBlockStatus();
            } finally {
              setBlockBusy(false);
            }
          },
        },
      ],
    );
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || sending || !token || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe) return;

    if (body.length > 2000) {
      setError('Messages must be 2,000 characters or fewer.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/messages/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body }),
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not send message.');
      }

      if (data.message) {
        setMessages(current => {
          if (current.some(message => message.id === data.message.id)) return current;
          return [...current, data.message];
        });
      }
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const isMine = (message: Message) => message.sender_id === user?.id;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.chatHeader}>
        <View style={styles.avatar}>
          {otherAvatarUrl ? (
            <Image
              source={{ uri: otherAvatarUrl }}
              style={styles.avatarImage}
              onError={() => {}}
            />
          ) : (
            <Text style={styles.avatarText}>
              {(otherDisplayName || otherUsername || 'R').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {otherDisplayName || otherUsername || 'Runner'}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{otherUsername || otherUserId}
          </Text>
          <Text style={styles.chatStatus}>
            {blockStatus?.blockedByMe || blockStatus?.blockedMe
              ? 'Messaging unavailable'
              : 'JogQuest runner'}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            loadMessages();
            loadBlockStatus();
          }}
          style={styles.refreshButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh chat"
        >
          <Text style={styles.refreshText}>↻</Text>
        </Pressable>
        <Pressable
          onPress={changeBlockStatus}
          disabled={!blockStatus || blockBusy}
          accessibilityRole="button"
          accessibilityLabel={blockStatus?.blockedByMe ? 'Unblock runner' : 'Block runner'}
          style={[styles.blockButton, (!blockStatus || blockBusy) && styles.sendDisabled]}
        >
          <Text style={styles.blockButtonText}>
            {blockBusy ? 'PLEASE WAIT' : blockStatus?.blockedByMe ? 'UNBLOCK' : 'BLOCK'}
          </Text>
        </Pressable>
      </View>

      {blockStatus?.blockedMe && (
        <Text style={styles.blockNotice}>
          This runner has blocked you. You cannot send messages.
        </Text>
      )}
      {blockStatus?.blockedByMe && (
        <Text style={styles.blockNotice}>
          You blocked this runner. Unblock them to send messages.
        </Text>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      ) : (
        <FlatList
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={[styles.messageRow, isMine(item) ? styles.mineRow : styles.theirsRow]}>
              <View style={[styles.bubble, isMine(item) ? styles.mineBubble : styles.theirsBubble]}>
                <Text style={[styles.messageText, isMine(item) && styles.mineText]}>
                  {item.body}
                </Text>
                <Text style={[styles.timestamp, isMine(item) && styles.mineTimestamp]}>
                  {new Date(item.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Start the conversation</Text>
              <Text style={styles.emptySubtitle}>Send a message to say hello.</Text>
            </View>
          }
        />
      )}

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message…"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
          multiline
          maxLength={2000}
          editable={!sending && !!blockStatus && !blockStatus.blockedByMe && !blockStatus.blockedMe}
          accessibilityLabel="Message text"
        />
        <Pressable
          onPress={sendMessage}
          disabled={sending || !draft.trim() || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.sendButton,
            (!draft.trim() || sending || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe) && styles.sendDisabled,
            pressed && styles.sendPressed,
          ]}
        >
          {sending
            ? <ActivityIndicator color={COLORS.background} />
            : <Text style={styles.sendText}>SEND</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: COLORS.background, fontSize: 17, fontWeight: '900' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 24 },
  chatStatus: { color: COLORS.accent, fontSize: 11, fontWeight: '600', marginTop: 3 },
  headerText: { flex: 1 },
  name: { ...TYPOGRAPHY.h3, color: COLORS.text, fontSize: 16 },
  username: { ...TYPOGRAPHY.body, color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  refreshButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: COLORS.accent, fontSize: 22 },
  blockButton: {
    minHeight: 38,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockButtonText: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  blockNotice: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  error: { ...TYPOGRAPHY.body, color: COLORS.danger, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messagesList: { flex: 1 },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  messageRow: { width: '100%', marginBottom: 12 },
  mineRow: { alignItems: 'flex-end' },
  theirsRow: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '84%',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  mineBubble: { backgroundColor: COLORS.accent, borderBottomRightRadius: 5 },
  theirsBubble: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 5 },
  messageText: { ...TYPOGRAPHY.body, color: COLORS.text, fontSize: 15 },
  mineText: { color: COLORS.background },
  timestamp: { color: COLORS.textMuted, fontSize: 10, textAlign: 'right', marginTop: 5 },
  mineTimestamp: { color: '#3E4A00' },
  empty: { alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { ...TYPOGRAPHY.h2, color: COLORS.text },
  emptySubtitle: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: SPACING.xs },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingBottom: 14,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    paddingHorizontal: 18,
    paddingTop: 13,
    paddingBottom: 12,
    fontSize: 15,
  },
  sendButton: {
    minWidth: 68,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.45 },
  sendPressed: { opacity: 0.8 },
  sendText: { color: COLORS.background, fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
});

export default ChatScreen;

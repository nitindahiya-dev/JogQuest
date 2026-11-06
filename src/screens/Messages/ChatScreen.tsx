import React, { useCallback, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
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
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_message_id?: string | null;
  reply_to?: {
    id: string;
    sender_id: string;
    body: string;
    deleted_at?: string | null;
  } | null;
};

type ChatApiResponse = {
  error?: string;
  messages?: Message[];
  blockedByMe?: boolean;
  blockedMe?: boolean;
  message?: Message;
};

const getLocalDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const getDateSeparatorLabel = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (getLocalDateKey(date) === getLocalDateKey(today)) return 'Today';
  if (getLocalDateKey(date) === getLocalDateKey(yesterday)) return 'Yesterday';

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
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
  const messagesListRef = useRef<FlatList<Message>>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendLockRef = useRef(false);
  const pendingSendRef = useRef<{ key: string; body: string; replyToMessageId: string | null } | null>(null);
  const [error, setError] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
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
      const data = (await response.json().catch(() => ({}))) as ChatApiResponse;

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
      const data = (await response.json().catch(() => ({}))) as ChatApiResponse;

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

      if (!token || !conversationId) return undefined;

      // Socket connections are scoped to the focused conversation.
      const messagingSocket: Socket = io(API_BASE_URL, {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });

      const joinConversation = () => {
        messagingSocket.emit(
          'conversation:join',
          { conversationId },
          (result: { ok?: boolean; error?: string } | undefined) => {
            if (!result?.ok) {
              console.warn('Could not join live conversation:', result?.error);
            }
          },
        );
      };

      const appendIncomingMessage = (incoming: Message) => {
        if (!incoming?.id) return;
        setMessages(current => {
          if (current.some(message => message.id === incoming.id)) return current;
          return [...current, incoming].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
        });
      };

      const updateIncomingMessage = (incoming: Partial<Message> & { id: string }) => {
        setMessages(current => current.map(message =>
          message.id === incoming.id ? { ...message, ...incoming } : message,
        ));
      };

      const deleteIncomingMessage = (event: { id: string; deleted_at?: string }) => {
        if (!event?.id) return;
        setMessages(current => current.map(message =>
          message.id === event.id
            ? { ...message, body: '', deleted_at: event.deleted_at ?? new Date().toISOString() }
            : message,
        ));
      };

      messagingSocket.on('connect', joinConversation);
      messagingSocket.on('message:new', appendIncomingMessage);
      messagingSocket.on('message:updated', updateIncomingMessage);
      messagingSocket.on('message:deleted', deleteIncomingMessage);

      return () => {
        messagingSocket.emit('conversation:leave', { conversationId });
        messagingSocket.removeAllListeners();
        messagingSocket.disconnect();
      };
    }, [conversationId, token, loadMessages, loadBlockStatus]),
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
              const data = (await response.json().catch(() => ({}))) as ChatApiResponse;

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

    if (
      !body ||
      sendLockRef.current ||
      sending ||
      !token ||
      !conversationId ||
      !blockStatus ||
      blockStatus.blockedByMe ||
      blockStatus.blockedMe
    ) {
      return;
    }

    if (body.length > 2000) {
      setError('Messages must be 2,000 characters or fewer.');
      return;
    }

    // Reuse the same key when retrying the same message after an uncertain
    // network result. Editing the draft creates a new submission key.
    const replyToMessageId = replyingTo?.id ?? null;
    if (
      !pendingSendRef.current ||
      pendingSendRef.current.body !== body ||
      pendingSendRef.current.replyToMessageId !== replyToMessageId
    ) {
      const key = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
        const random = Math.floor(Math.random() * 16);
        return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
      });
      pendingSendRef.current = { key, body, replyToMessageId };
    }

    const idempotencyKey = pendingSendRef.current.key;

    // Lock synchronously so rapid taps cannot start duplicate requests.
    sendLockRef.current = true;
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
          body: JSON.stringify({ body, idempotencyKey, replyToMessageId }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as ChatApiResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Could not send message.');
      }

      const sentMessage = data.message;

      if (sentMessage) {
        setMessages(current => {
          if (current.some(message => message.id === sentMessage.id)) return current;
          return [...current, sentMessage];
        });
      } else {
        await loadMessages();
      }

      // Clear the pending key and draft only after server confirmation.
      pendingSendRef.current = null;
      setDraft('');
      setReplyingTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send message.');
      // Keep the original key so retrying this exact draft is safe.
    } finally {
      sendLockRef.current = false;
      setSending(false);
    }
  };

  const cancelMessageContext = () => {
    setReplyingTo(null);
    setEditingMessage(null);
    setDraft('');
  };

  const saveEditedMessage = async () => {
    const body = draft.trim();
    if (!body || !editingMessage || !token || !conversationId || sending) return;
    if (body.length > 2000) {
      setError('Messages must be 2,000 characters or fewer.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/messages/conversations/${conversationId}/messages/${editingMessage.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as ChatApiResponse;
      if (!response.ok) throw new Error(data.error || 'Could not edit message.');

      if (data.message) {
        setMessages(current => current.map(message =>
          message.id === data.message!.id ? { ...message, ...data.message! } : message,
        ));
      } else {
        await loadMessages();
      }
      cancelMessageContext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not edit message.');
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = (message: Message) => {
    alert('Delete message?', 'This message will be replaced with a deleted-message notice.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!token || !conversationId) return;
          try {
            const response = await fetch(
              `${API_BASE_URL}/api/messages/conversations/${conversationId}/messages/${message.id}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
            );
            const data = (await response.json().catch(() => ({}))) as ChatApiResponse;
            if (!response.ok) throw new Error(data.error || 'Could not delete message.');
            setMessages(current => current.map(item =>
              item.id === message.id
                ? { ...item, body: '', deleted_at: new Date().toISOString() }
                : item,
            ));
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not delete message.');
          }
        },
      },
    ]);
  };

  const openMessageActions = (message: Message) => {
    const ownMessage = message.sender_id === user?.id;
    const buttons: Array<{
      text: string;
      style?: 'default' | 'cancel' | 'destructive';
      onPress?: () => void;
    }> = [
      { text: 'Reply', onPress: () => { setEditingMessage(null); setReplyingTo(message); } },
    ];

    if (ownMessage && !message.deleted_at) {
      buttons.push({
        text: 'Edit',
        onPress: () => {
          setReplyingTo(null);
          setEditingMessage(message);
          setDraft(message.body);
        },
      });
      buttons.push({
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMessage(message),
      });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    alert('Message actions', 'Choose an action for this message.', buttons);
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
          ref={messagesListRef}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          data={messages}
          keyExtractor={item => item.id}
          onContentSizeChange={() =>
            messagesListRef.current?.scrollToEnd({ animated: false })
          }
          renderItem={({ item, index }) => {
            const previous = index > 0 ? messages[index - 1] : undefined;
            const next = index < messages.length - 1 ? messages[index + 1] : undefined;

            const showDateSeparator =
              !previous ||
              getLocalDateKey(previous.created_at) !== getLocalDateKey(item.created_at);

            const groupedWithNext =
              !!next &&
              next.sender_id === item.sender_id &&
              getLocalDateKey(next.created_at) === getLocalDateKey(item.created_at);

            return (
              <View>
                {showDateSeparator && (
                  <View style={styles.dateSeparator}>
                    <Text style={styles.dateSeparatorText}>
                      {getDateSeparatorLabel(item.created_at)}
                    </Text>
                  </View>
                )}
                <View
                  style={[
                    styles.messageRow,
                    groupedWithNext && styles.messageRowGrouped,
                    isMine(item) ? styles.mineRow : styles.theirsRow,
                  ]}
                >
                  <Pressable
                    onLongPress={() => openMessageActions(item)}
                    delayLongPress={350}
                    accessibilityRole="button"
                    accessibilityLabel="Message actions"
                  >
                    <View style={[styles.bubble, isMine(item) ? styles.mineBubble : styles.theirsBubble]}>
                      {item.reply_to && (
                        <View style={[styles.replyPreview, isMine(item) && styles.mineReplyPreview]}>
                          <Text style={styles.replyAuthor}>
                            {item.reply_to.sender_id === user?.id
                              ? 'You'
                              : (otherDisplayName || otherUsername || 'Runner')}
                          </Text>
                          <Text style={styles.replyBody} numberOfLines={2}>
                            {item.reply_to.deleted_at ? 'Message deleted' : item.reply_to.body}
                          </Text>
                        </View>
                      )}
                      {item.deleted_at ? (
                        <Text style={[styles.messageText, styles.deletedMessageText]}>
                          This message was deleted
                        </Text>
                      ) : (
                        <Text style={[styles.messageText, isMine(item) && styles.mineText]}>
                          {item.body.split(/(https?:\/\/[^\s]+)/gi).map((part, partIndex) => {
                            if (!/^https?:\/\//i.test(part)) {
                              return part;
                            }

                            const trailing = part.match(/[.,!?;:)}\]]+$/)?.[0] ?? '';
                            const url = part.slice(0, part.length - trailing.length);

                            return (
                              <React.Fragment key={`${item.id}-part-${partIndex}`}>
                                <Text
                                  style={[styles.messageLink, isMine(item) && styles.mineMessageLink]}
                                  accessibilityRole="link"
                                  accessibilityLabel={`Open link ${url}`}
                                  onPress={() => {
                                    if (/^https?:\/\//i.test(url)) {
                                      void Linking.openURL(url).catch(() => {});
                                    }
                                  }}
                                >
                                  {url}
                                </Text>
                                {trailing}
                              </React.Fragment>
                            );
                          })}
                        </Text>
                      )}
                      {item.edited_at && !item.deleted_at && (
                        <Text style={[styles.editedLabel, isMine(item) && styles.mineTimestamp]}>
                          Edited
                        </Text>
                      )}
                      <Text style={[styles.timestamp, isMine(item) && styles.mineTimestamp]}>
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              {error ? (
                <>
                  <Text style={styles.emptyTitle}>Couldn't load messages</Text>
                  <Text style={styles.emptySubtitle}>
                    Check your connection and try again.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={loadMessages}
                    style={({ pressed }) => [
                      styles.retryButton,
                      pressed && styles.sendPressed,
                    ]}
                  >
                    <Text style={styles.retryText}>TRY AGAIN</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Start the conversation</Text>
                  <Text style={styles.emptySubtitle}>
                    Send a message to say hello.
                  </Text>
                </>
              )}
            </View>
          }
        />
      )}

      {(replyingTo || editingMessage) && (
        <View style={styles.composerContext}>
          <View style={styles.composerContextText}>
            <Text style={styles.composerContextTitle}>
              {editingMessage
                ? 'Editing message'
                : `Replying to ${replyingTo?.sender_id === user?.id ? 'yourself' : (otherDisplayName || otherUsername || 'Runner')}`}
            </Text>
            <Text style={styles.composerContextBody} numberOfLines={1}>
              {editingMessage?.body ?? (replyingTo?.deleted_at ? 'Message deleted' : replyingTo?.body)}
            </Text>
          </View>
          <Pressable
            onPress={cancelMessageContext}
            accessibilityRole="button"
            accessibilityLabel="Cancel reply or edit"
          >
            <Text style={styles.contextClose}>×</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.composer}>
        <View style={styles.composerInputWrap}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a message…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            multiline
            maxLength={2000}
            blurOnSubmit={false}
            editable={!sending && !!blockStatus && !blockStatus.blockedByMe && !blockStatus.blockedMe}
            accessibilityLabel="Message text"
            accessibilityHint="Enter a message up to 2,000 characters. Use the send button to submit."
          />
          <View style={styles.composerMeta}>
            <Text
              style={[
                styles.characterCount,
                draft.length >= 1800 && styles.characterCountWarning,
                draft.length >= 1950 && styles.characterCountLimit,
              ]}
              accessibilityLiveRegion="polite"
            >
              {draft.length}/2000
            </Text>
          </View>
        </View>
        <Pressable
          onPress={editingMessage ? saveEditedMessage : sendMessage}
          disabled={sending || !draft.trim() || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe}
          accessibilityRole="button"
          accessibilityState={{
            disabled:
              sending ||
              !draft.trim() ||
              !blockStatus ||
              blockStatus.blockedByMe ||
              blockStatus.blockedMe,
            busy: sending,
          }}
          style={({ pressed }) => [
            styles.sendButton,
            (!draft.trim() || sending || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe) && styles.sendDisabled,
            pressed && styles.sendPressed,
          ]}
        >
          {sending
            ? <ActivityIndicator color={COLORS.background} />
            : <Text style={styles.sendText}>{editingMessage ? 'SAVE' : 'SEND'}</Text>}
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
  dateSeparator: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateSeparatorText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  messageRow: { width: '100%', marginBottom: 12 },
  messageRowGrouped: { marginBottom: 4 },
  mineRow: { alignItems: 'flex-end' },
  theirsRow: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '86%',
    minWidth: 64,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },
  mineBubble: {
    backgroundColor: COLORS.accent,
    borderBottomRightRadius: 5,
  },
  theirsBubble: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 5,
  },
  messageText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
    flexShrink: 1,
  },
  mineText: { color: COLORS.background },
  messageLink: {
    color: COLORS.accent,
    textDecorationLine: 'underline',
  },
  mineMessageLink: {
    color: COLORS.background,
    textDecorationLine: 'underline',
  },
  timestamp: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 6,
    alignSelf: 'flex-end',
    fontVariant: ['tabular-nums'],
  },
  mineTimestamp: { color: '#3E4A00' },
  empty: { alignItems: 'center', padding: SPACING.xl },
  emptyTitle: { ...TYPOGRAPHY.h2, color: COLORS.text },
  emptySubtitle: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: SPACING.xs },
  retryButton: {
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 14,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  composerInputWrap: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  input: {
    width: '100%',
    maxHeight: 120,
    minHeight: 46,
    color: COLORS.text,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  composerMeta: {
    minHeight: 22,
    paddingHorizontal: 14,
    paddingBottom: 7,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  characterCount: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  characterCountWarning: {
    color: '#E5A33A',
  },
  characterCountLimit: {
    color: COLORS.danger,
    fontWeight: '900',
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
  replyPreview: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    backgroundColor: 'rgba(0,0,0,0.12)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    marginBottom: 7,
    borderRadius: 7,
  },
  mineReplyPreview: { backgroundColor: 'rgba(0,0,0,0.16)' },
  replyAuthor: { color: COLORS.accent, fontSize: 11, fontWeight: '800' },
  replyBody: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  deletedMessageText: { color: COLORS.textMuted, fontStyle: 'italic' },
  editedLabel: { color: COLORS.textMuted, fontSize: 10, marginTop: 3 },
  composerContext: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  composerContextText: { flex: 1 },
  composerContextTitle: { color: COLORS.accent, fontSize: 11, fontWeight: '800' },
  composerContextBody: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  contextClose: { color: COLORS.textMuted, fontSize: 24, paddingHorizontal: 8 },

});

export default ChatScreen;

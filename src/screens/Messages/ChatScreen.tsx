import React, { useCallback, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { launchImageLibrary } from 'react-native-image-picker';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
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

type MessageAttachment = {
  url: string;
  mime_type?: string;
  file_size_bytes?: number;
  original_name?: string | null;
};

type SelectedImage = {
  uri: string;
  type: string;
  fileName: string;
  fileSize?: number;
};

type SelectedDocument = {
  uri: string;
  type: string;
  fileName: string;
  fileSize?: number;
};

type Message = {
  attachment?: MessageAttachment | null;
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
  reactions?: Array<{
    emoji: string;
    count: number;
    reactedByMe: boolean;
  }>;
};

type ChatApiResponse = {
  error?: string;
  messages?: Message[];
  blockedByMe?: boolean;
  blockedMe?: boolean;
  message?: Message;
  messageId?: string;
  reactions?: Array<{
    emoji: string;
    count: number;
    reactedByMe: boolean;
  }>;
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
  const messagingSocketRef = useRef<Socket | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTypingRef = useRef(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendLockRef = useRef(false);
  const pendingSendRef = useRef<{
    key: string;
    body: string;
    replyToMessageId: string | null;
    imageUri: string | null;
    documentUri: string | null;
  } | null>(null);
  const [error, setError] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [blockStatus, setBlockStatus] = useState<{
    blockedByMe: boolean;
    blockedMe: boolean;
  } | null>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const conversationBlockedRef = useRef(false);

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
      if (!conversationBlockedRef.current) {
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
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

      conversationBlockedRef.current = false;

      // Socket connections are scoped to the focused conversation.
      const messagingSocket: Socket = io(API_BASE_URL, {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });
      messagingSocketRef.current = messagingSocket;

      const joinConversation = () => {
        messagingSocket.emit(
          'conversation:join',
          { conversationId },
          (
            result:
              | { ok?: boolean; error?: string; otherUserOnline?: boolean }
              | undefined,
          ) => {
            if (!result?.ok) {
              console.warn('Could not join live conversation:', result?.error);
              return;
            }

            setOtherUserOnline(result.otherUserOnline === true);
          },
        );
      };

      const appendIncomingMessage = (incoming: Message) => {
        if (conversationBlockedRef.current || !incoming?.id) return;
        setMessages(current => {
          if (current.some(message => message.id === incoming.id)) return current;
          return [...current, incoming].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
        });
      };

      const updateIncomingMessage = (incoming: Partial<Message> & { id: string }) => {
        if (conversationBlockedRef.current) return;
        setMessages(current => current.map(message =>
          message.id === incoming.id ? { ...message, ...incoming } : message,
        ));
      };

      const deleteIncomingMessage = (event: { id: string; deleted_at?: string }) => {
        if (conversationBlockedRef.current || !event?.id) return;
        setMessages(current => current.map(message =>
          message.id === event.id
            ? { ...message, body: '', deleted_at: event.deleted_at ?? new Date().toISOString() }
            : message,
        ));
      };

      const handleConversationBlocked = (event: {
        conversationId?: string;
        blockedByUserId?: string;
      }) => {
        if (
          event?.conversationId !== conversationId ||
          conversationBlockedRef.current
        ) return;

        conversationBlockedRef.current = true;
        setBlockStatus({
          blockedByMe: event.blockedByUserId === user?.id,
          blockedMe: event.blockedByUserId !== user?.id,
        });
        setMessages([]);
        if (remoteTypingTimerRef.current) {
          clearTimeout(remoteTypingTimerRef.current);
        }
        remoteTypingTimerRef.current = null;
        setOtherUserTyping(false);
        setOtherUserOnline(false);
        setDraft('');
        setReplyingTo(null);
        setEditingMessage(null);
        pendingSendRef.current = null;
        setError('Messaging is unavailable because one participant blocked the other.');
        setLoading(false);
        messagingSocket.disconnect();
      };

      messagingSocket.on('connect', joinConversation);
      messagingSocket.on('message:new', appendIncomingMessage);
      messagingSocket.on('message:updated', updateIncomingMessage);
      messagingSocket.on('message:deleted', deleteIncomingMessage);

      const handleReactionUpdate = (event: {
        messageId?: string;
        reactions?: Array<{ emoji: string; count: number }>;
        reactedByUserId?: string;
        userReactionEmoji?: string | null;
      }) => {
        if (
          conversationBlockedRef.current ||
          !event?.messageId ||
          !Array.isArray(event.reactions)
        ) return;

        setMessages(current => current.map(message => {
          if (message.id !== event.messageId) return message;

          // Preserve this device's own reaction when the other user reacts.
          const ownEmoji =
            event.reactedByUserId === user?.id
              ? event.userReactionEmoji
              : message.reactions?.find(r => r.reactedByMe)?.emoji ?? null;

          return {
            ...message,
            reactions: event.reactions!.map(reaction => ({
              ...reaction,
              reactedByMe: reaction.emoji === ownEmoji,
            })),
          };
        }));
      };

      messagingSocket.on('message:reactions:updated', handleReactionUpdate);

      const handleOtherTyping = (event: { conversationId?: string }) => {
        if (
          event?.conversationId !== conversationId ||
          conversationBlockedRef.current
        ) return;

        setOtherUserTyping(true);

        if (remoteTypingTimerRef.current) {
          clearTimeout(remoteTypingTimerRef.current);
        }

        remoteTypingTimerRef.current = setTimeout(() => {
          setOtherUserTyping(false);
          remoteTypingTimerRef.current = null;
        }, 5000);
      };

      const handleOtherStoppedTyping = (event: { conversationId?: string }) => {
        if (event?.conversationId === conversationId) {
          if (remoteTypingTimerRef.current) {
            clearTimeout(remoteTypingTimerRef.current);
          }
          remoteTypingTimerRef.current = null;
          setOtherUserTyping(false);
        }
      };

      const handlePresenceUpdate = (event: {
        userId?: string;
        online?: boolean;
      }) => {
        if (event?.userId !== otherUserId) return;
        setOtherUserOnline(event.online === true);
      };

      messagingSocket.on('conversation:blocked', handleConversationBlocked);
      messagingSocket.on('typing:start', handleOtherTyping);
      messagingSocket.on('typing:stop', handleOtherStoppedTyping);
      messagingSocket.on('presence:update', handlePresenceUpdate);

      return () => {
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        if (remoteTypingTimerRef.current) {
          clearTimeout(remoteTypingTimerRef.current);
        }
        typingTimerRef.current = null;
        remoteTypingTimerRef.current = null;
        localTypingRef.current = false;
        setOtherUserTyping(false);
        setOtherUserOnline(false);
        messagingSocket.emit('typing:stop', { conversationId });
        messagingSocket.emit('conversation:leave', { conversationId });
        messagingSocket.removeAllListeners();
        messagingSocket.disconnect();
        if (messagingSocketRef.current === messagingSocket) {
          messagingSocketRef.current = null;
        }
      };
    }, [conversationId, token, loadMessages, loadBlockStatus]),
  );

  const chooseImage = async () => {
    if (sending || editingMessage || conversationBlockedRef.current) return;

    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.8,
        maxWidth: 2048,
        maxHeight: 2048,
      });

      if (result.didCancel) return;

      if (result.errorCode) {
        throw new Error(result.errorMessage || 'Could not open your photo library.');
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        throw new Error('The selected image could not be opened.');
      }

      const mimeType = asset.type || 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        throw new Error('Choose a JPEG, PNG, or WebP image.');
      }

      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
        throw new Error('Images must be 10 MB or smaller.');
      }

      setSelectedDocument(null);
      setSelectedImage({
        uri: asset.uri,
        type: mimeType,
        fileName: asset.fileName || `chat-image-${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`,
        fileSize: asset.fileSize,
      });
      setError('');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not select image.';
      setError(message);
    }
  };

  const chooseDocument = async () => {
    if (sending || editingMessage || conversationBlockedRef.current) return;

    try {
      const [asset] = await pick({ type: [types.allFiles] });
      if (!asset?.uri) {
        throw new Error('The selected document could not be opened.');
      }

      const name = asset.name || '';
      const extension = name.split('.').pop()?.toLowerCase() || '';

      const supportedDocuments: Record<string, string> = {
        txt: 'text/plain',
        csv: 'text/csv',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        pdf: 'application/pdf',
      };

      const mimeType = supportedDocuments[extension];

      if (!mimeType) {
        throw new Error('Supported documents: PDF, TXT, CSV, DOCX, XLSX and PPTX.');
      }

      if (
        asset.type &&
        asset.type.toLowerCase() !== mimeType &&
        !(extension === 'csv' && asset.type.toLowerCase() === 'text/comma-separated-values')
      ) {
        throw new Error('The selected file extension and document type do not match.');
      }

      if (asset.size != null && asset.size > 10 * 1024 * 1024) {
        throw new Error('Documents must be 10 MB or smaller.');
      }

      setSelectedImage(null);
      setSelectedDocument({
        uri: asset.uri,
        type: mimeType,
        fileName: name,
        fileSize: asset.size ?? undefined,
      });
      setError('');
    } catch (e) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not select PDF.');
    }
  };

  const formatAttachmentSize = (bytes?: number) => {
    if (bytes == null) return 'Document';
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);

    const socket = messagingSocketRef.current;
    if (!socket?.connected || conversationBlockedRef.current) return;

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

    if (value.trim()) {
      if (!localTypingRef.current) {
        localTypingRef.current = true;
        socket.emit('typing:start', { conversationId });
      }

      typingTimerRef.current = setTimeout(() => {
        localTypingRef.current = false;
        socket.emit('typing:stop', { conversationId });
        typingTimerRef.current = null;
      }, 1500);
    } else if (localTypingRef.current) {
      localTypingRef.current = false;
      socket.emit('typing:stop', { conversationId });
      typingTimerRef.current = null;
    }
  };

  const stopLocalTyping = () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;

    if (localTypingRef.current) {
      localTypingRef.current = false;
      messagingSocketRef.current?.emit('typing:stop', { conversationId });
    }
  };


  const submitUserReport = async (message?: Message) => {
    if (!token || !otherUserId || otherUserId === user?.id) return;

    const reasons = [
      { label: 'Harassment', value: 'HARASSMENT' },
      { label: 'Spam', value: 'SPAM' },
      { label: 'Inappropriate content', value: 'INAPPROPRIATE_CONTENT' },
      { label: 'Threats', value: 'THREATS' },
      { label: 'Other', value: 'OTHER' },
    ];

    alert(
      message ? 'Report this message' : 'Report this runner',
      'Choose the reason that best describes the issue.',
      [
        ...reasons.map(reason => ({
          text: reason.label,
          onPress: async () => {
            try {
              const response = await fetch(
                `${API_BASE_URL}/api/messages/reports`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    reportedUserId: otherUserId,
                    ...(message ? { messageId: message.id } : {}),
                    reason: reason.value,
                  }),
                },
              );

              const data = await response.json().catch(() => ({})) as {
                error?: string;
              };

              if (!response.ok) {
                throw new Error(data.error || 'Could not submit report.');
              }

              alert(
                'Report submitted',
                'Thank you. Your report has been sent for review.',
              );
            } catch (e) {
              alert(
                'Report failed',
                e instanceof Error ? e.message : 'Could not submit report.',
              );
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

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
    const image = selectedImage;
    const document = selectedDocument;
    const attachment = image || document;

    if (
      (!body && !attachment) ||
      editingMessage ||
      conversationBlockedRef.current ||
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
      pendingSendRef.current.replyToMessageId !== replyToMessageId ||
      pendingSendRef.current.imageUri !== (image?.uri ?? null) ||
      pendingSendRef.current.documentUri !== (document?.uri ?? null)
    ) {
      const key = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
        const random = Math.floor(Math.random() * 16);
        return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
      });
      pendingSendRef.current = {
        key,
        body,
        replyToMessageId,
        imageUri: image?.uri ?? null,
        documentUri: document?.uri ?? null,
      };
    }

    const idempotencyKey = pendingSendRef.current.key;

    // Lock synchronously so rapid taps cannot start duplicate requests.
    stopLocalTyping();
    sendLockRef.current = true;
    setSending(true);
    setError('');

    try {
      let response: Response;

      if (attachment) {
        const formData = new FormData();
        formData.append('body', body);
        formData.append('idempotencyKey', idempotencyKey);
        if (replyToMessageId) {
          formData.append('replyToMessageId', replyToMessageId);
        }
        formData.append('attachment', {
          uri: attachment.uri,
          type: attachment.type,
          name: attachment.fileName,
        } as any);

        response = await fetch(
          `${API_BASE_URL}/api/messages/conversations/${conversationId}/attachments`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData as any,
          },
        );
      } else {
        response = await fetch(
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
      }
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
      setSelectedImage(null);
      setSelectedDocument(null);
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
    setSelectedImage(null);
    setSelectedDocument(null);
  };

  const saveEditedMessage = async () => {
    const body = draft.trim();
    if (!body || !editingMessage || !token || !conversationId || sending || conversationBlockedRef.current) return;
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
          if (!token || !conversationId || conversationBlockedRef.current) return;
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

  const toggleReaction = async (message: Message, emoji: string) => {
    if (
      !token ||
      !conversationId ||
      message.deleted_at ||
      conversationBlockedRef.current
    ) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/messages/conversations/${conversationId}/messages/${message.id}/reactions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ emoji }),
        },
      );

      const data = (await response.json().catch(() => ({}))) as ChatApiResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Could not update reaction.');
      }

      if (Array.isArray(data.reactions)) {
        setMessages(current => current.map(item =>
          item.id === message.id
            ? { ...item, reactions: data.reactions }
            : item,
        ));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update reaction.');
    }
  };

  const chooseReaction = (message: Message) => {
    const emojis = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

    alert(
      'React to message',
      'Choose a reaction. Select it again to remove it.',
      [
        ...emojis.map(emoji => ({
          text: emoji,
          onPress: () => { void toggleReaction(message, emoji); },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const openMessageActions = (message: Message) => {
    const ownMessage = message.sender_id === user?.id;
    const buttons: Array<{
      text: string;
      style?: 'default' | 'cancel' | 'destructive';
      onPress?: () => void;
    }> = [
      ...(!message.deleted_at
        ? [{ text: 'React', onPress: () => chooseReaction(message) }]
        : []),
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
    if (!ownMessage && !message.deleted_at) {
      buttons.push({
        text: 'Report Message',
        style: 'destructive',
        onPress: () => submitUserReport(message),
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
              : otherUserTyping
                ? 'Typing…'
                : otherUserOnline
                  ? 'Online'
                  : 'Offline'}
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
          onPress={() => submitUserReport()}
          disabled={!token || !otherUserId || blockStatus?.blockedByMe === true}
          accessibilityRole="button"
          accessibilityLabel="Report runner"
          style={[
            styles.blockButton,
            { borderColor: COLORS.border },
            (!token || !otherUserId || blockStatus?.blockedByMe === true) && styles.sendDisabled,
          ]}
        >
          <Text style={[styles.blockButtonText, { color: COLORS.textMuted }]}>
            REPORT
          </Text>
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
                        <>
                          {item.attachment?.url && !item.attachment.mime_type?.startsWith('image/') ? (
                            <Pressable
                              onPress={() => {
                                void Linking.openURL(item.attachment!.url).catch(() => {
                                  setError('Could not open this PDF attachment.');
                                });
                              }}
                              accessibilityRole="link"
                              accessibilityLabel={`Open attachment ${item.attachment.original_name || 'document'}`}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                padding: 12,
                                marginBottom: 6,
                                borderRadius: 10,
                                backgroundColor: 'rgba(128,128,128,0.16)',
                              }}
                            >
                              <Text style={{ fontSize: 25, marginRight: 10 }}>📄</Text>
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={[styles.messageText, isMine(item) && styles.mineText]}
                                  numberOfLines={2}
                                >
                                  {item.attachment.original_name || 'Document'}
                                </Text>
                                <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>
                                  {(item.attachment.mime_type || 'Document').split('/').pop()?.toUpperCase()} · {formatAttachmentSize(item.attachment.file_size_bytes)}
                                </Text>
                              </View>
                              <Text style={[styles.messageText, isMine(item) && styles.mineText]}>↗</Text>
                            </Pressable>
                          ) : item.attachment?.url ? (
                            <Image
                              source={{ uri: item.attachment.url }}
                              style={styles.messageAttachment}
                              resizeMode="cover"
                              accessibilityLabel="Image attachment"
                            />
                          ) : null}
                          {!!item.body && <Text style={[styles.messageText, isMine(item) && styles.mineText]}>
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
                        </Text>}
                        </>
                      )}
                      {item.edited_at && !item.deleted_at && (
                        <Text style={[styles.editedLabel, isMine(item) && styles.mineTimestamp]}>
                          Edited {new Date(item.edited_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      )}
                      <Text style={[styles.timestamp, isMine(item) && styles.mineTimestamp]}>
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    {!!item.reactions?.length && (
                      <View style={[
                        styles.reactionsRow,
                        isMine(item) ? styles.reactionsMine : styles.reactionsTheirs,
                      ]}>
                        {item.reactions.map(reaction => (
                          <View
                            key={`${item.id}-${reaction.emoji}`}
                            style={[
                              styles.reactionChip,
                              reaction.reactedByMe && styles.reactionChipMine,
                            ]}
                          >
                            <Text style={styles.reactionText}>
                              {reaction.emoji} {reaction.count}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
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
      {selectedImage && !editingMessage && (
        <View style={styles.imagePreviewRow}>
          <Image
            source={{ uri: selectedImage.uri }}
            style={styles.imagePreview}
            resizeMode="cover"
            accessibilityLabel="Selected image preview"
          />
          <View style={styles.imagePreviewInfo}>
            <Text style={styles.imagePreviewTitle}>Image ready to send</Text>
            <Text style={styles.imagePreviewName} numberOfLines={1}>
              {selectedImage.fileName}
            </Text>
          </View>
          <Pressable
            onPress={() => setSelectedImage(null)}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Remove selected image"
            style={styles.removeImageButton}
          >
            <Text style={styles.removeImageText}>×</Text>
          </Pressable>
        </View>
      )}
      {selectedDocument && !editingMessage && (
        <View style={styles.imagePreviewRow}>
          <View style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(128,128,128,0.18)',
          }}>
            <Text style={{ fontSize: 24 }}>📄</Text>
          </View>
          <View style={styles.imagePreviewInfo}>
            <Text style={styles.imagePreviewTitle}>Document ready to send</Text>
            <Text style={styles.imagePreviewName} numberOfLines={1}>
              {selectedDocument.fileName} · {formatAttachmentSize(selectedDocument.fileSize)}
            </Text>
          </View>
          <Pressable
            onPress={() => setSelectedDocument(null)}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Remove selected PDF"
            style={styles.removeImageButton}
          >
            <Text style={styles.removeImageText}>×</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.composer}>
        <Pressable
          onPress={chooseImage}
          disabled={sending || !!editingMessage || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe}
          accessibilityRole="button"
          accessibilityLabel="Attach an image"
          style={({ pressed }) => [
            styles.attachButton,
            (sending || !!editingMessage || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe) && styles.sendDisabled,
            pressed && styles.sendPressed,
          ]}
        >
          <Text style={styles.attachButtonText}>＋</Text>
        </Pressable>
        <Pressable
          onPress={chooseDocument}
          disabled={sending || !!editingMessage || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe}
          accessibilityRole="button"
          accessibilityLabel="Attach a document"
          style={({ pressed }) => [
            styles.attachButton,
            (sending || !!editingMessage || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe) && styles.sendDisabled,
            pressed && styles.sendPressed,
          ]}
        >
          <Text style={styles.attachButtonText}>PDF</Text>
        </Pressable>
        <View style={styles.composerInputWrap}>
          <TextInput
            value={draft}
            onChangeText={handleDraftChange}
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
          disabled={sending || (!draft.trim() && !selectedImage && !selectedDocument) || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe}
          accessibilityRole="button"
          accessibilityState={{
            disabled:
              sending ||
              (!draft.trim() && !selectedImage && !selectedDocument) ||
              !blockStatus ||
              blockStatus.blockedByMe ||
              blockStatus.blockedMe,
            busy: sending,
          }}
          style={({ pressed }) => [
            styles.sendButton,
            ((!draft.trim() && !selectedImage && !selectedDocument) || sending || !blockStatus || blockStatus.blockedByMe || blockStatus.blockedMe) && styles.sendDisabled,
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
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    maxWidth: '86%',
    marginTop: 5,
  },
  reactionsMine: { alignSelf: 'flex-end' },
  reactionsTheirs: { alignSelf: 'flex-start' },
  reactionChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionChipMine: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.surface,
  },
  reactionText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
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
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 10,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  imagePreview: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: COLORS.background,
  },
  imagePreviewInfo: { flex: 1, minWidth: 0 },
  imagePreviewTitle: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  imagePreviewName: { color: COLORS.textMuted, fontSize: 10, marginTop: 3 },
  removeImageButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  removeImageText: { color: COLORS.text, fontSize: 22, lineHeight: 25 },
  messageAttachment: {
    width: 230,
    height: 190,
    maxWidth: '100%',
    borderRadius: 12,
    marginBottom: 7,
    backgroundColor: COLORS.background,
  },
  attachButton: {
    width: 42,
    height: 48,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  attachButtonText: { color: COLORS.accent, fontSize: 27, lineHeight: 30 },
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

import { Router, type Express } from 'express';
import type { PoolClient } from 'pg';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
};

export function registerMessagingRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { pool, query, requireAuth, createClient, multer, randomUUID } = context;
  const getIO = () => context.io;

  const isUserViewingConversation = async (
    conversationId: string,
    recipientId: string,
  ): Promise<boolean> => {
    const io = getIO();
    if (!io) return false;
    try {
      const sockets = await io.in(`conversation:${conversationId}`).fetchSockets();
      return sockets.some((socket: any) => socket.data?.userId === recipientId);
    } catch (error) {
      console.warn('Could not check conversation presence:', error);
      return false;
    }
  };

  const emitNotificationUpdates = async (
    recipientId: string,
    notification: any,
  ) => {
    if (!notification) return;
    getIO()?.to(`user:${recipientId}`).emit('notification:new', { notification });
    try {
      const unread = await query(
        `SELECT COUNT(*)::int AS count
         FROM notifications
         WHERE user_id = $1 AND read_at IS NULL`,
        [recipientId],
      );
      getIO()?.to(`user:${recipientId}`).emit(
        'notifications:unread-count',
        { unreadCount: Number(unread.rows[0]?.count ?? 0) },
      );
    } catch (error) {
      console.error('Failed to emit notification unread count:', error);
    }
  };

  const attachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (_req: any, file: any, callback: any) => {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        callback(new Error('Unsupported attachment type. Use an image, PDF, TXT, CSV, DOCX, XLSX, or PPTX.'));
        return;
      }
      callback(null, true);
    },
  });

  const handleAttachmentUpload = (req: any, res: any, next: any) => {
    attachmentUpload.single('attachment')(req, res, (error: any) => {
      if (error) {
        return res.status(400).json({
          error: error.code === 'LIMIT_FILE_SIZE'
            ? 'Attachment exceeds the 10 MB upload limit'
            : error.message || 'Attachment upload failed',
        });
      }
      next();
    });
  };

  const getStorageClient = () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Private chat storage is not configured');
    return createClient(url, key);
  };

  const signedAttachment = async (storage: any, attachment: any) => {
    if (!attachment) return null;
    const { data, error } = await storage.storage
      .from('chat-media')
      .createSignedUrl(attachment.storage_path, 60 * 60);
    if (error || !data?.signedUrl) {
      console.error('Could not sign chat attachment URL:', error?.message);
      return null;
    }
    return {
      id: attachment.id,
      mime_type: attachment.mime_type,
      file_size_bytes: attachment.file_size_bytes,
      original_name: attachment.original_name,
      url: data.signedUrl,
    };
  };

  // Process persisted storage cleanup jobs. Failed jobs remain queued for retry.
  const processAttachmentCleanup = async () => {
    try {
      const pending = await query(
        `SELECT storage_path
         FROM message_attachment_cleanup
         ORDER BY created_at ASC
         LIMIT 25`,
      );

      if (!pending.rowCount) return;

      const storage = getStorageClient();

      for (const item of pending.rows) {
        const { error } = await storage.storage
          .from('chat-media')
          .remove([item.storage_path]);

        if (error) {
          await query(
            `UPDATE message_attachment_cleanup
             SET attempts = attempts + 1,
                 last_error = $2,
                 last_attempt_at = NOW()
             WHERE storage_path = $1`,
            [item.storage_path, String(error.message || 'Storage removal failed').slice(0, 1000)],
          );
          console.error('Attachment cleanup deferred:', error.message);
          continue;
        }

        // Remove metadata only after Storage confirms successful removal.
        await query(
          'DELETE FROM message_attachments WHERE storage_path = $1',
          [item.storage_path],
        );
        await query(
          'DELETE FROM message_attachment_cleanup WHERE storage_path = $1',
          [item.storage_path],
        );
      }
    } catch (error) {
      // Keep jobs in the database when Storage or the database is unavailable.
      console.error('Attachment cleanup processor deferred:', error);
    }
  };

  
  router.patch('/api/messages/conversations/:conversationId/settings', requireAuth, async (req, res) => {
    const userId = res.locals.authenticatedUserId as string;
    const { conversationId } = req.params;
    const { muted, archived } = req.body ?? {};

    if (
      (muted !== undefined && typeof muted !== 'boolean') ||
      (archived !== undefined && typeof archived !== 'boolean') ||
      (muted === undefined && archived === undefined)
    ) {
      return res.status(400).json({ error: 'Provide muted and/or archived as booleans' });
    }

    try {
      const result = await query(
        `UPDATE conversation_participants
         SET muted_at = CASE
               WHEN $3::boolean IS NULL THEN muted_at
               WHEN $3::boolean THEN COALESCE(muted_at, NOW())
               ELSE NULL
             END,
             archived_at = CASE
               WHEN $4::boolean IS NULL THEN archived_at
               WHEN $4::boolean THEN COALESCE(archived_at, NOW())
               ELSE NULL
             END
         WHERE conversation_id = $1 AND user_id = $2
         RETURNING muted_at IS NOT NULL AS is_muted,
                   archived_at IS NOT NULL AS is_archived`,
        [
          conversationId,
          userId,
          typeof muted === 'boolean' ? muted : null,
          typeof archived === 'boolean' ? archived : null,
        ],
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      getIO()?.to(`user:${userId}`).emit('conversation:settings-updated', {
        conversationId,
        ...result.rows[0],
      });

      return res.json({ conversation: result.rows[0] });
    } catch (error) {
      console.error('Update conversation settings failed:', error);
      return res.status(500).json({ error: 'Could not update conversation settings' });
    }
  });

  router.delete('/api/messages/conversations/:conversationId', requireAuth, async (req, res) => {
    const userId = res.locals.authenticatedUserId as string;

    try {
      const result = await query(
        `UPDATE conversation_participants
         SET hidden_at = NOW()
         WHERE conversation_id = $1 AND user_id = $2
         RETURNING conversation_id`,
        [req.params.conversationId, userId],
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      getIO()?.to(`user:${userId}`).emit('conversation:hidden', {
        conversationId: req.params.conversationId,
      });

      return res.json({ success: true });
    } catch (error) {
      console.error('Hide conversation failed:', error);
      return res.status(500).json({ error: 'Could not remove conversation' });
    }
  });

router.get('/api/messages/conversations', requireAuth, async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const result = await query(
        `SELECT c.id,
                CASE WHEN c.user_one_id = $1 THEN c.user_two_id ELSE c.user_one_id END AS other_user_id,
                u.username AS other_username,
                u.display_name AS other_display_name,
                u.avatar_url AS other_avatar_url,
                CASE WHEN EXISTS (
                  SELECT 1 FROM user_blocks ub
                  WHERE (ub.blocker_id = $1 AND ub.blocked_id = u.id)
                     OR (ub.blocker_id = u.id AND ub.blocked_id = $1)
                ) THEN NULL
                WHEN m.deleted_at IS NOT NULL THEN 'Message deleted'
                WHEN m.has_attachment = TRUE THEN
                  CASE WHEN length(trim(m.body)) > 0
                    THEN '📎 Attachment · ' || m.body
                    ELSE '📎 Attachment'
                  END
                ELSE m.body END AS last_message,
                CASE WHEN EXISTS (
                  SELECT 1 FROM user_blocks ub
                  WHERE (ub.blocker_id = $1 AND ub.blocked_id = u.id)
                     OR (ub.blocker_id = u.id AND ub.blocked_id = $1)
                ) THEN NULL ELSE m.created_at END AS last_message_at,
                CASE WHEN EXISTS (
                  SELECT 1 FROM user_blocks ub
                  WHERE (ub.blocker_id = $1 AND ub.blocked_id = u.id)
                     OR (ub.blocker_id = u.id AND ub.blocked_id = $1)
                ) THEN 0 ELSE (
                  SELECT COUNT(*)::int
                  FROM messages unread
                  JOIN conversation_participants unread_cp
                    ON unread_cp.conversation_id = unread.conversation_id
                  WHERE unread.conversation_id = c.id
                    AND unread.sender_id <> $1
                    AND unread_cp.user_id = $1
                    AND (
                      unread_cp.last_read_at IS NULL
                      OR unread.created_at > unread_cp.last_read_at
                    )
                ) END AS unread_count,
                (cp.muted_at IS NOT NULL) AS is_muted,
                (cp.archived_at IS NOT NULL) AS is_archived
         FROM conversations c
         JOIN users u ON u.id = CASE
           WHEN c.user_one_id = $1 THEN c.user_two_id ELSE c.user_one_id END
         LEFT JOIN LATERAL (
           SELECT body, created_at FROM messages
           WHERE conversation_id = c.id
           ORDER BY created_at DESC LIMIT 1
         ) m ON TRUE
         JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
         WHERE (c.user_one_id = $1 OR c.user_two_id = $1)
           AND cp.hidden_at IS NULL
           AND (
             ($2 = 'archived' AND cp.archived_at IS NOT NULL)
             OR ($2 = 'inbox' AND cp.archived_at IS NULL)
           )
         ORDER BY m.created_at DESC NULLS LAST, c.updated_at DESC`,
        [userId, req.query.view === 'archived' ? 'archived' : 'inbox'],
      );

      res.json({ conversations: result.rows });
    } catch (error) {
      console.error('List conversations failed:', error);
      res.status(500).json({ error: 'Failed to load conversations' });
    }
  });

  router.post('/api/messages/conversations', requireAuth, async (req, res) => {
    const userId = res.locals.authenticatedUserId as string;
    const otherUserId = String(req.body?.userId ?? req.body?.otherUserId ?? '');

    if (!otherUserId || otherUserId === userId) {
      res.status(400).json({ error: 'A valid recipient is required' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query(
        'SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [[userId, otherUserId]],
      );
      if (lock.rowCount !== 2) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const blocked = await client.query(
        `SELECT 1 FROM user_blocks
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
        [userId, otherUserId],
      );
      if (blocked.rowCount) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'Messaging is unavailable for this user' });
        return;
      }

      const [one, two] = [userId, otherUserId].sort();
      const conversation = await client.query(
        `INSERT INTO conversations (user_one_id, user_two_id)
         VALUES ($1, $2)
         ON CONFLICT (user_one_id, user_two_id)
         DO UPDATE SET updated_at = conversations.updated_at
         RETURNING id`,
        [one, two],
      );
      const conversationId = conversation.rows[0].id;
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id)
         VALUES ($1, $2), ($1, $3)
         ON CONFLICT DO NOTHING`,
        [conversationId, one, two],
      );
      await client.query('COMMIT');
      res.status(200).json({ conversationId, id: conversationId });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Create conversation failed:', error);
      res.status(500).json({ error: 'Failed to create conversation' });
    } finally {
      client.release();
    }
  });

  router.get(
    '/api/messages/conversations/:conversationId/messages',
    requireAuth,
    async (req, res) => {
      const userId = res.locals.authenticatedUserId as string;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const membership = await client.query(
          `SELECT c.id,
                  CASE WHEN c.user_one_id = $2 THEN c.user_two_id ELSE c.user_one_id END AS other_user_id
           FROM conversations c
           JOIN conversation_participants cp ON cp.conversation_id = c.id
           WHERE c.id = $1 AND cp.user_id = $2`,
          [req.params.conversationId, userId],
        );
        if (!membership.rowCount) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: 'Conversation not found' });
          return;
        }

        const otherUserId = membership.rows[0].other_user_id as string;
        const blocked = await client.query(
          `SELECT 1 FROM user_blocks
           WHERE (blocker_id = $1 AND blocked_id = $2)
              OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
          [userId, otherUserId],
        );
        if (blocked.rowCount) {
          await client.query(
            `UPDATE conversation_participants
             SET last_read_at = NOW()
             WHERE conversation_id = $1 AND user_id = $2`,
            [req.params.conversationId, userId],
          );
          await client.query('COMMIT');
          res.json({ messages: [] });
          return;
        }

        const result = await client.query(
          `SELECT
             m.id,
             m.sender_id,
             CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END AS body,
             m.created_at,
             m.edited_at,
             m.deleted_at,
             m.reply_to_message_id,
             CASE WHEN rm.id IS NULL THEN NULL ELSE json_build_object(
               'id', rm.id,
               'sender_id', rm.sender_id,
               'body', CASE WHEN rm.deleted_at IS NULL THEN rm.body ELSE '' END,
               'deleted_at', rm.deleted_at             ) END AS reply_to,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'emoji', grouped.emoji,
                 'count', grouped.reaction_count,
                 'reactedByMe', grouped.reacted_by_me
               ))
               FROM (
                 SELECT
                   mr.emoji,
                   COUNT(*)::int AS reaction_count,
                   BOOL_OR(mr.user_id = $2) AS reacted_by_me
                 FROM message_reactions mr
                 WHERE mr.message_id = m.id
                 GROUP BY mr.emoji
               ) grouped
             ), '[]'::json) AS reactions,
             (
               SELECT json_build_object(
                 'id', ma.id,
                 'storage_path', ma.storage_path,
                 'mime_type', ma.mime_type,
                 'file_size_bytes', ma.file_size_bytes,
                 'original_name', ma.original_name
               )
               FROM message_attachments ma
               WHERE ma.message_id = m.id
                 AND m.deleted_at IS NULL
             ) AS attachment
           FROM (
             SELECT *
             FROM messages
             WHERE conversation_id = $1
             ORDER BY created_at DESC
             LIMIT 100
           ) m
           LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
           ORDER BY m.created_at ASC`,
          [req.params.conversationId, userId],
        );

        // Mark only messages returned by this read as read.
        // This avoids advancing the read cursor beyond the fetched message set.
        const latestFetchedMessage = result.rows[result.rows.length - 1];
        if (latestFetchedMessage) {
          await client.query(
            `UPDATE conversation_participants
             SET last_read_at = GREATEST(
               COALESCE(last_read_at, '-infinity'::timestamptz),
               $3::timestamptz
             )
             WHERE conversation_id = $1 AND user_id = $2`,
            [
              req.params.conversationId,
              userId,
              latestFetchedMessage.created_at,
            ],
          );
        }
        const incomingMessageIds = result.rows
          .filter((row: any) => row.sender_id !== userId)
          .map((row: any) => row.id);

        if (incomingMessageIds.length > 0) {
          await client.query(
            `UPDATE notifications
             SET read_at = COALESCE(read_at, NOW())
             WHERE user_id = $1
               AND type = 'NEW_MESSAGE'
               AND conversation_id = $2
               AND message_id = ANY($3::uuid[])`,
            [userId, req.params.conversationId, incomingMessageIds],
          );
        }

        await client.query('COMMIT');

        if (incomingMessageIds.length > 0) {
          try {
            const unread = await query(
              `SELECT COUNT(*)::int AS count
               FROM notifications
               WHERE user_id = $1 AND read_at IS NULL`,
              [userId],
            );
            getIO()?.to(`user:${userId}`).emit(
              'notifications:unread-count',
              { unreadCount: Number(unread.rows[0]?.count ?? 0) },
            );
          } catch (error) {
            console.error('Failed to emit unread notification count:', error);
          }
        }

        const hasAttachments = result.rows.some((row: any) => !!row.attachment);
        const storage = hasAttachments ? getStorageClient() : null;
        const messages = await Promise.all(result.rows.map(async (row: any) => {
          const attachment = row.attachment;
          delete row.attachment;
          return {
            ...row,
            attachment: attachment
              ? await signedAttachment(storage, attachment)
              : null,
          };
        }));

        res.json({ messages });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error('Read messages failed:', error);
        res.status(500).json({ error: 'Failed to load messages' });
      } finally {
        client.release();
      }
    },
  );


  // chat-media attachment upload: private storage + conversation-authorized access.
  router.post(
    '/api/messages/conversations/:conversationId/attachments',
    requireAuth,
    handleAttachmentUpload,
    async (req: any, res: any) => {
      const userId = res.locals.authenticatedUserId as string;
      const file = req.file as any;
      const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
      const replyToMessageId =
        typeof req.body?.replyToMessageId === 'string'
          ? req.body.replyToMessageId
          : null;
      const idempotencyKey =
        typeof req.body?.idempotencyKey === 'string'
          ? req.body.idempotencyKey
          : null;

      if (!file) {
        return res.status(400).json({ error: 'Choose an image or PDF to send' });
      }
      if (body.length > 2000) {
        return res.status(400).json({ error: 'Message must be 2,000 characters or fewer' });
      }
      if (
        idempotencyKey &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
      ) {
        return res.status(400).json({ error: 'Invalid message idempotency key' });
      }

      const extensionByType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'application/pdf': 'pdf',
        'text/plain': 'txt',
        'text/csv': 'csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      };

      const extension = extensionByType[file.mimetype];
      const originalName = typeof file.originalname === 'string'
        ? file.originalname.trim()
        : '';
      const suppliedExtension = originalName.includes('.')
        ? originalName.split('.').pop()?.toLowerCase()
        : '';

      if (!extension || suppliedExtension !== extension) {
        return res.status(400).json({
          error: 'The attachment filename and file type do not match.',
        });
      }

      if (!file.buffer || file.buffer.length === 0) {
        return res.status(400).json({ error: 'The attachment is empty.' });
      }

      if (
        file.mimetype === 'application/pdf' &&
        (file.buffer.length < 5 ||
          file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-')
      ) {
        return res.status(400).json({ error: 'The selected file is not a valid PDF.' });
      }

      const officeMimeTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ];

      if (
        officeMimeTypes.includes(file.mimetype) &&
        (file.buffer.length < 4 ||
          file.buffer.subarray(0, 2).toString('ascii') !== 'PK')
      ) {
        return res.status(400).json({
          error: 'The selected Office document is not a valid file.',
        });
      }

      let storage: any;
      let storagePath: string | null = null;
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const conversation = await client.query(
          `SELECT id,
                  CASE WHEN user_one_id = $2 THEN user_two_id ELSE user_one_id END AS other_user_id
           FROM conversations
           WHERE id = $1 AND (user_one_id = $2 OR user_two_id = $2)
           FOR UPDATE`,
          [req.params.conversationId, userId],
        );
        if (!conversation.rowCount) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Conversation not found' });
        }

        const otherUserId = conversation.rows[0].other_user_id;
        const blocked = await client.query(
          `SELECT 1 FROM user_blocks
           WHERE (blocker_id = $1 AND blocked_id = $2)
              OR (blocker_id = $2 AND blocked_id = $1)
           LIMIT 1`,
          [userId, otherUserId],
        );
        if (blocked.rowCount) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Messaging is unavailable for this user' });
        }

        if (replyToMessageId) {
          const replyTarget = await client.query(
            `SELECT id FROM messages
             WHERE id = $1 AND conversation_id = $2`,
            [replyToMessageId, req.params.conversationId],
          );
          if (!replyTarget.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Reply target not found in this conversation' });
          }
        }

        // Resolve an uncertain retry before uploading another copy of the image.
        if (idempotencyKey) {
          const existing = await client.query(
            `SELECT m.id, m.sender_id, m.body, m.created_at, m.edited_at,
                    m.deleted_at, m.reply_to_message_id,
                    ma.id AS attachment_id, ma.storage_path, ma.mime_type,
                    ma.file_size_bytes, ma.original_name
             FROM messages m
             LEFT JOIN message_attachments ma ON ma.message_id = m.id
             WHERE m.conversation_id = $1
               AND m.sender_id = $2
               AND m.idempotency_key = $3`,
            [req.params.conversationId, userId, idempotencyKey],
          );

          if (existing.rowCount) {
            const row = existing.rows[0];
            if (
              row.body !== body ||
              row.reply_to_message_id !== replyToMessageId ||
              !row.attachment_id ||
              row.mime_type !== file.mimetype
            ) {
              await client.query('ROLLBACK');
              return res.status(409).json({
                error: 'This retry key is already associated with a different message.',
              });
            }

            await client.query('COMMIT');
            storage = getStorageClient();
            const message = {
              id: row.id,
              sender_id: row.sender_id,
              body: row.body,
              created_at: row.created_at,
              edited_at: row.edited_at,
              deleted_at: row.deleted_at,
              reply_to_message_id: row.reply_to_message_id,
              attachment: await signedAttachment(storage, {
                id: row.attachment_id,
                storage_path: row.storage_path,
                mime_type: row.mime_type,
                file_size_bytes: row.file_size_bytes,
                original_name: row.original_name,
              }),
            };
            return res.json({ message });
          }
        }

        storage = getStorageClient();
        storagePath = `${req.params.conversationId}/${userId}/${randomUUID()}.${extension}`;

        const { error: uploadError } = await storage.storage
          .from('chat-media')
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          await client.query('ROLLBACK');
          storagePath = null;
          console.error('Chat attachment upload failed:', uploadError.message);
          return res.status(502).json({ error: 'Could not upload attachment' });
        }

        const inserted = await client.query(
          `INSERT INTO messages (
             conversation_id, sender_id, body, idempotency_key,
             reply_to_message_id, has_attachment
           )
           VALUES ($1, $2, $3, $4, $5, TRUE)
           RETURNING id, sender_id, body, created_at, edited_at, deleted_at,
                     reply_to_message_id`,
          [
            req.params.conversationId,
            userId,
            body,
            idempotencyKey,
            replyToMessageId,
          ],
        );
        const message = inserted.rows[0];

        const attachmentResult = await client.query(
          `INSERT INTO message_attachments (
             message_id, storage_path, mime_type, file_size_bytes, original_name
           )
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, storage_path, mime_type, file_size_bytes, original_name`,
          [
            message.id,
            storagePath,
            file.mimetype,
            file.size,
            typeof file.originalname === 'string'
              ? file.originalname.slice(0, 255)
              : null,
          ],
        );

        await client.query(
          'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
          [req.params.conversationId],
        );
        await client.query(
          `UPDATE conversation_participants
           SET archived_at = NULL, hidden_at = NULL
           WHERE conversation_id = $1 AND user_id = $2`,
          [req.params.conversationId, otherUserId],
        );

        let createdNotification = null;
        const recipientViewing = await isUserViewingConversation(
          req.params.conversationId,
          otherUserId,
        );

        if (!recipientViewing) {
          const notificationResult = await client.query(
            `INSERT INTO notifications (
               user_id, type, title, message, dedupe_key,
               conversation_id, message_id
             )
             SELECT $1, 'NEW_MESSAGE', 'New message',
                    'You received a new message.', $2, $3, $4
             WHERE NOT EXISTS (
               SELECT 1 FROM conversation_participants
               WHERE conversation_id = $3
                 AND user_id = $1
                 AND muted_at IS NOT NULL
             )
             AND NOT EXISTS (
               SELECT 1 FROM user_blocks
               WHERE (blocker_id = $1 AND blocked_id = $5)
                  OR (blocker_id = $5 AND blocked_id = $1)
             )
             ON CONFLICT (dedupe_key) DO NOTHING
             RETURNING id, user_id, type, title, message,
                       conversation_id, message_id, created_at, read_at`,
            [otherUserId, `message:${message.id}`,
             req.params.conversationId, message.id, userId],
          );
          createdNotification = notificationResult.rows[0] ?? null;
        }

        await client.query('COMMIT');

        const responseMessage = {
          ...message,
          attachment: await signedAttachment(storage, attachmentResult.rows[0]),
        };

        await emitNotificationUpdates(otherUserId, createdNotification);

        getIO()?.to(`conversation:${req.params.conversationId}`)
          .emit('message:new', responseMessage);
        getIO()?.to(`user:${otherUserId}`)
          .emit('conversation:updated', {
            conversationId: req.params.conversationId,
            message: responseMessage,
          });
        getIO()?.to(`user:${userId}`)
          .emit('conversation:updated', {
            conversationId: req.params.conversationId,
            message: responseMessage,
          });

        return res.status(201).json({ message: responseMessage });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);

        if (storagePath && storage) {
          const { error: cleanupError } = await storage.storage
            .from('chat-media')
            .remove([storagePath]);
          if (cleanupError) {
            console.error('Chat image cleanup failed:', cleanupError.message);
          }
        }

        console.error('Send attachment message failed:', error);
        return res.status(500).json({ error: 'Failed to send attachment message' });
      } finally {
        client.release();
      }
    },
  );

  router.post(
    '/api/messages/conversations/:conversationId/messages',
    requireAuth,
    async (req, res) => {
      const userId = res.locals.authenticatedUserId as string;
      const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
      if (!body || body.length > 2000) {
        res.status(400).json({ error: 'Message must contain 1–2000 characters' });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const conversation = await client.query(
          `SELECT id,
                  CASE WHEN user_one_id = $2 THEN user_two_id ELSE user_one_id END AS other_user_id
           FROM conversations
           WHERE id = $1 AND (user_one_id = $2 OR user_two_id = $2)
           FOR UPDATE`,
          [req.params.conversationId, userId],
        );
        if (!conversation.rowCount) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: 'Conversation not found' });
          return;
        }

        const otherUserId = conversation.rows[0].other_user_id as string;
        const blocked = await client.query(
          `SELECT 1 FROM user_blocks
           WHERE (blocker_id = $1 AND blocked_id = $2)
              OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
          [userId, otherUserId],
        );
        if (blocked.rowCount) {
          await client.query('ROLLBACK');
          res.status(403).json({ error: 'Messaging is unavailable for this user' });
          return;
        }

        const replyToMessageId =
          typeof req.body?.replyToMessageId === 'string'
            ? req.body.replyToMessageId
            : null;

        if (replyToMessageId) {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(replyToMessageId)) {
            await client.query('ROLLBACK');
            res.status(400).json({ error: 'Invalid reply target' });
            return;
          }

          const replyTarget = await client.query(
            `SELECT id FROM messages
             WHERE id = $1 AND conversation_id = $2`,
            [replyToMessageId, req.params.conversationId],
          );

          if (!replyTarget.rowCount) {
            await client.query('ROLLBACK');
            res.status(404).json({ error: 'Reply target not found in this conversation' });
            return;
          }
        }

        const idempotencyKey =
          typeof req.body?.idempotencyKey === 'string'
            ? req.body.idempotencyKey
            : null;

        if (
          idempotencyKey !== null &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
        ) {
          await client.query('ROLLBACK');
          res.status(400).json({ error: 'Invalid message idempotency key' });
          return;
        }

        const inserted = await client.query(
          `INSERT INTO messages (
             conversation_id, sender_id, body, idempotency_key, reply_to_message_id
           )
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (conversation_id, sender_id, idempotency_key)
             WHERE idempotency_key IS NOT NULL
           DO NOTHING
           RETURNING id, sender_id, body, created_at, edited_at, deleted_at,
                     reply_to_message_id`,
          [
            req.params.conversationId,
            userId,
            body,
            idempotencyKey,
            replyToMessageId,
          ],
        );

        let message = inserted.rows[0];
        const isNewMessage = !!message;

        if (!message && idempotencyKey) {
          const existing = await client.query(
            `SELECT id, sender_id, body, created_at, edited_at, deleted_at,
                    reply_to_message_id
             FROM messages
             WHERE conversation_id = $1
               AND sender_id = $2
               AND idempotency_key = $3`,
            [req.params.conversationId, userId, idempotencyKey],
          );

          message = existing.rows[0];

          if (!message) {
            throw new Error('Could not resolve idempotent message submission.');
          }

          if (message.body !== body || message.reply_to_message_id !== replyToMessageId) {
            await client.query('ROLLBACK');
            res.status(409).json({
              error: 'This retry key is already associated with a different message.',
            });
            return;
          }
        }

        if (isNewMessage) {
          await client.query(
            `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
            [req.params.conversationId],
          );

          await client.query(
            `UPDATE conversation_participants
             SET archived_at = NULL, hidden_at = NULL
             WHERE conversation_id = $1 AND user_id = $2`,
            [req.params.conversationId, otherUserId],
          );

          const recipientViewing = await isUserViewingConversation(
            req.params.conversationId,
            otherUserId,
          );

          var createdNotification = null;
          if (!recipientViewing) {
            const notificationResult = await client.query(
              `INSERT INTO notifications (
                 user_id, type, title, message, dedupe_key,
                 conversation_id, message_id
               )
               SELECT $1, 'NEW_MESSAGE', 'New message',
                      'You received a new message.', $2, $3, $4
               WHERE NOT EXISTS (
                 SELECT 1 FROM conversation_participants
                 WHERE conversation_id = $3
                   AND user_id = $1
                   AND muted_at IS NOT NULL
               )
               AND NOT EXISTS (
                 SELECT 1 FROM user_blocks
                 WHERE (blocker_id = $1 AND blocked_id = $5)
                    OR (blocker_id = $5 AND blocked_id = $1)
               )
               ON CONFLICT (dedupe_key) DO NOTHING
               RETURNING id, user_id, type, title, message,
                         conversation_id, message_id, created_at, read_at`,
              [otherUserId, `message:${message.id}`,
               req.params.conversationId, message.id, userId],
            );
            createdNotification = notificationResult.rows[0] ?? null;
          }
        }

        await client.query('COMMIT');

        if (isNewMessage) {
          await emitNotificationUpdates(otherUserId, createdNotification);

          getIO()?.to(`conversation:${req.params.conversationId}`)
            .emit('message:new', message);
          getIO()?.to(`user:${otherUserId}`)
            .emit('conversation:updated', {
              conversationId: req.params.conversationId,
              message,
            });
          getIO()?.to(`user:${userId}`)
            .emit('conversation:updated', {
              conversationId: req.params.conversationId,
              message,
            });
        }

        res.status(isNewMessage ? 201 : 200).json({ message });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error('Send message failed:', error);
        res.status(500).json({ error: 'Failed to send message' });
      } finally {
        client.release();
      }
    },
  );



  router.post(
    '/api/messages/conversations/:conversationId/messages/:messageId/reactions',
    requireAuth,
    async (req, res) => {
      const userId = res.locals.authenticatedUserId as string;
      const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji : '';
      const allowedEmojis = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

      if (!allowedEmojis.includes(emoji)) {
        res.status(400).json({ error: 'Unsupported reaction' });
        return;
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const accessibleMessage = await client.query(
          `SELECT m.id
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           JOIN conversation_participants cp
             ON cp.conversation_id = c.id AND cp.user_id = $3
           WHERE m.id = $1
             AND m.conversation_id = $2
             AND m.deleted_at IS NULL
             AND NOT EXISTS (
               SELECT 1
               FROM user_blocks b
               WHERE (b.blocker_id = c.user_one_id AND b.blocked_id = c.user_two_id)
                  OR (b.blocker_id = c.user_two_id AND b.blocked_id = c.user_one_id)
             )
           FOR UPDATE OF m`,
          [req.params.messageId, req.params.conversationId, userId],
        );

        if (!accessibleMessage.rowCount) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: 'Message not found or unavailable' });
          return;
        }

        // Selecting the same emoji removes it; another replaces it.
        const removed = await client.query(
          `DELETE FROM message_reactions
           WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
          [req.params.messageId, userId, emoji],
        );

        if (!removed.rowCount) {
          await client.query(
            `INSERT INTO message_reactions (message_id, user_id, emoji)
             VALUES ($1, $2, $3)
             ON CONFLICT (message_id, user_id)
             DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()`,
            [req.params.messageId, userId, emoji],
          );
        }

        const summary = await client.query(
          `SELECT
             emoji,
             COUNT(*)::int AS count,
             BOOL_OR(user_id = $2) AS "reactedByMe"
           FROM message_reactions
           WHERE message_id = $1
           GROUP BY emoji
           ORDER BY emoji`,
          [req.params.messageId, userId],
        );

        const myReaction = summary.rows.find(
          (reaction: { emoji: string; reactedByMe: boolean }) =>
            reaction.reactedByMe
        );

        await client.query('COMMIT');

        // HTTP response is specific to the requesting user.
        res.json({
          messageId: req.params.messageId,
          reactions: summary.rows,
        });

        // Socket event contains counts, not the requester's personal
        // reactedByMe value. Each receiving client derives that locally.
        getIO()?.to(`conversation:${req.params.conversationId}`)
          .emit('message:reactions:updated', {
            messageId: req.params.messageId,
            reactions: summary.rows.map(
              ({ emoji: reactionEmoji, count }: {
                emoji: string;
                count: number;
              }) => ({ emoji: reactionEmoji, count })
            ),
            reactedByUserId: userId,
            userReactionEmoji: myReaction?.emoji ?? null,
          });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error('Toggle message reaction failed:', error);
        res.status(500).json({ error: 'Failed to update reaction' });
      } finally {
        client.release();
      }
    },
  );

  router.patch(
    '/api/messages/conversations/:conversationId/messages/:messageId',
    requireAuth,
    async (req, res) => {
      const userId = res.locals.authenticatedUserId as string;
      const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';

      if (!body || body.length > 2000) {
        res.status(400).json({ error: 'Message must contain 1–2000 characters' });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const updated = await client.query(
          `UPDATE messages
           SET body = $1, edited_at = NOW()
           WHERE id = $2
             AND conversation_id = $3
             AND sender_id = $4
             AND deleted_at IS NULL
           RETURNING id, sender_id, body, created_at, edited_at,
                     deleted_at, reply_to_message_id`,
          [body, req.params.messageId, req.params.conversationId, userId],
        );

        if (!updated.rowCount) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: 'Message not found or cannot be edited' });
          return;
        }

        await client.query(
          'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
          [req.params.conversationId],
        );
        const participantUsers = await client.query(
          `SELECT user_id FROM conversation_participants
           WHERE conversation_id = $1`,
          [req.params.conversationId],
        );
        await client.query('COMMIT');
        getIO()?.to(`conversation:${req.params.conversationId}`)
          .emit('message:updated', updated.rows[0]);

        for (const participant of participantUsers.rows) {
          getIO()?.to(`user:${participant.user_id}`)
            .emit('conversation:updated', {
              conversationId: req.params.conversationId,
            });
        }
        res.json({ message: updated.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error('Edit message failed:', error);
        res.status(500).json({ error: 'Failed to edit message' });
      } finally {
        client.release();
      }
    },
  );

  router.delete(
    '/api/messages/conversations/:conversationId/messages/:messageId',
    requireAuth,
    async (req, res) => {
      const userId = res.locals.authenticatedUserId as string;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const attachment = await client.query(
          `SELECT ma.storage_path
           FROM message_attachments ma
           JOIN messages m ON m.id = ma.message_id
           WHERE m.id = $1
             AND m.conversation_id = $2
             AND m.sender_id = $3
           FOR UPDATE OF m`,
          [req.params.messageId, req.params.conversationId, userId],
        );

        const deleted = await client.query(
          `UPDATE messages
           SET deleted_at = NOW()
           WHERE id = $1
             AND conversation_id = $2
             AND sender_id = $3
             AND deleted_at IS NULL
           RETURNING id`,
          [req.params.messageId, req.params.conversationId, userId],
        );

        if (!deleted.rowCount) {
          await client.query('ROLLBACK');
          res.status(404).json({ error: 'Message not found or already deleted' });
          return;
        }

        await client.query(
          'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
          [req.params.conversationId],
        );
        if (attachment.rowCount) {
          await client.query(
            `INSERT INTO message_attachment_cleanup (storage_path)
             VALUES ($1)
             ON CONFLICT (storage_path) DO NOTHING`,
            [attachment.rows[0].storage_path],
          );
        }

        const participantUsers = await client.query(
          `SELECT user_id FROM conversation_participants
           WHERE conversation_id = $1`,
          [req.params.conversationId],
        );

        await client.query('COMMIT');
        // Cleanup is retryable; a Storage failure does not undo message deletion.
        await processAttachmentCleanup();
        getIO()?.to(`conversation:${req.params.conversationId}`)
          .emit('message:deleted', {
            id: req.params.messageId,
            deleted_at: new Date().toISOString(),
          });

        for (const participant of participantUsers.rows) {
          getIO()?.to(`user:${participant.user_id}`)
            .emit('conversation:updated', {
              conversationId: req.params.conversationId,
            });
        }

        res.json({ ok: true });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error('Delete message failed:', error);
        res.status(500).json({ error: 'Failed to delete message' });
      } finally {
        client.release();
      }
    },
  );

  router.get('/api/messages/blocks/:otherUserId', requireAuth, async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const otherUserId = req.params.otherUserId;
      const result = await query(
        `SELECT
           EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2) AS blocked_by_me,
           EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = $2 AND blocked_id = $1) AS blocked_me`,
        [userId, otherUserId],
      );
      res.json({
        blockedByMe: result.rows[0].blocked_by_me,
        blockedMe: result.rows[0].blocked_me,
      });
    } catch (error) {
      console.error('Get block status failed:', error);
      res.status(500).json({ error: 'Failed to load block status' });
    }
  });

  router.post('/api/messages/blocks/:otherUserId', requireAuth, async (req, res) => {
    const userId = res.locals.authenticatedUserId as string;
    const otherUserId = req.params.otherUserId;
    if (otherUserId === userId) {
      res.status(400).json({ error: 'You cannot block yourself' });
      return;
    }
    try {
      await query(
        `INSERT INTO user_blocks (blocker_id, blocked_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, otherUserId],
      );

      // Immediately revoke existing real-time access to this conversation.
      const conversation = await query<{ id: string }>(
        `SELECT id
         FROM conversations
         WHERE (user_one_id = $1 AND user_two_id = $2)
            OR (user_one_id = $2 AND user_two_id = $1)
         LIMIT 1`,
        [userId, otherUserId],
      );

      if (conversation.rows.length > 0) {
        const conversationId = conversation.rows[0].id;
        const room = `conversation:${conversationId}`;

        getIO()?.to(room).emit('conversation:blocked', {
          conversationId,
          blockedByUserId: userId,
        });

        void getIO()?.in(room).socketsLeave(room);
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Block user failed:', error);
      res.status(500).json({ error: 'Failed to block user' });
    }
  });

  router.delete('/api/messages/blocks/:otherUserId', requireAuth, async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const result = await query(
        'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
        [userId, req.params.otherUserId],
      );
      res.json({ ok: true, removed: result.rowCount ?? 0 });
    } catch (error) {
      console.error('Unblock user failed:', error);
      res.status(500).json({ error: 'Failed to unblock user' });
    }
  });


  // Submit a report about a runner or a message in an existing conversation.
  router.post('/api/messages/reports', requireAuth, async (req, res) => {
    const reporterId = res.locals.authenticatedUserId as string;
    const { reportedUserId, messageId, reason, details } = req.body ?? {};
    const allowedReasons = [
      'HARASSMENT',
      'SPAM',
      'INAPPROPRIATE_CONTENT',
      'THREATS',
      'IMPERSONATION',
      'OTHER',
    ];

    const isUuid = (value: unknown): value is string =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    if (
      !isUuid(reportedUserId) ||
      (messageId !== undefined && messageId !== null && !isUuid(messageId))
    ) {
      return res.status(400).json({ error: 'Invalid user or message ID' });
    }

    if (reportedUserId === reporterId) {
      return res.status(400).json({ error: 'You cannot report yourself' });
    }

    if (typeof reason !== 'string' || !allowedReasons.includes(reason)) {
      return res.status(400).json({ error: 'Select a valid report reason' });
    }

    if (
      details !== undefined &&
      details !== null &&
      (typeof details !== 'string' || details.length > 1000)
    ) {
      return res.status(400).json({
        error: 'Report details must be 1000 characters or fewer',
      });
    }

    try {
      const target = await query(
        'SELECT id FROM users WHERE id = $1 LIMIT 1',
        [reportedUserId],
      );

      if (target.rows.length === 0) {
        return res.status(404).json({ error: 'Reported user not found' });
      }

      if (messageId) {
        const message = await query(
          `SELECT m.id
           FROM messages m
           INNER JOIN conversations c ON c.id = m.conversation_id
           WHERE m.id = $1
             AND m.sender_id = $2
             AND (c.user_one_id = $3 OR c.user_two_id = $3)
           LIMIT 1`,
          [messageId, reportedUserId, reporterId],
        );

        if (message.rows.length === 0) {
          return res.status(404).json({
            error: 'Message not found or not available in your conversation',
          });
        }
      }

      const inserted = await query(
        `INSERT INTO user_reports (
           reporter_id, reported_user_id, message_id, reason, details
         )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING id, reported_user_id, message_id, reason, status, created_at`,
        [
          reporterId,
          reportedUserId,
          messageId ?? null,
          reason,
          typeof details === 'string' ? details.trim() || null : null,
        ],
      );

      if (inserted.rows.length === 0) {
        return res.status(409).json({
          error: 'You have already submitted this report',
        });
      }

      return res.status(201).json({
        ok: true,
        report: inserted.rows[0],
      });
    } catch (error) {
      console.error('Create user report failed:', error);
      return res.status(500).json({ error: 'Failed to submit report' });
    }
  });

  // A runner can only see reports submitted by their own account.
  router.get('/api/messages/reports/mine', requireAuth, async (_req, res) => {
    try {
      const reporterId = res.locals.authenticatedUserId as string;
      const result = await query(
        `SELECT
           r.id,
           r.reported_user_id AS "reportedUserId",
           u.username AS "reportedUsername",
           r.message_id AS "messageId",
           r.reason,
           r.details,
           r.status,
           r.created_at AS "createdAt",
           r.updated_at AS "updatedAt"
         FROM user_reports r
         INNER JOIN users u ON u.id = r.reported_user_id
         WHERE r.reporter_id = $1
         ORDER BY r.created_at DESC
         LIMIT 100`,
        [reporterId],
      );

      return res.json({ reports: result.rows });
    } catch (error) {
      console.error('Get submitted reports failed:', error);
      return res.status(500).json({ error: 'Failed to load submitted reports' });
    }
  });

  // Moderation queue: access is restricted to trusted platform administrators.
  router.get('/api/messages/moderation/reports', requireAuth, async (req, res) => {
    try {
      const moderatorId = res.locals.authenticatedUserId as string;
      const access = await query(
        'SELECT 1 FROM platform_admins WHERE user_id = $1 LIMIT 1',
        [moderatorId],
      );

      if (access.rows.length === 0) {
        return res.status(403).json({ error: 'Platform moderator access required' });
      }

      const status =
        typeof req.query.status === 'string' ? req.query.status : 'OPEN';
      const allowedStatuses = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid report status filter' });
      }

      const result = await query(
        `SELECT
           r.id,
           r.reporter_id AS "reporterId",
           reporter.username AS "reporterUsername",
           r.reported_user_id AS "reportedUserId",
           reported.username AS "reportedUsername",
           r.message_id AS "messageId",
           r.reason,
           r.details,
           r.status,
           r.moderator_id AS "moderatorId",
           r.moderator_notes AS "moderatorNotes",
           r.reviewed_at AS "reviewedAt",
           r.created_at AS "createdAt",
           r.updated_at AS "updatedAt"
         FROM user_reports r
         INNER JOIN users reporter ON reporter.id = r.reporter_id
         INNER JOIN users reported ON reported.id = r.reported_user_id
         WHERE ($1 = 'ALL' OR r.status = $1)
         ORDER BY
           CASE WHEN r.status = 'OPEN' THEN 0 ELSE 1 END,
           r.created_at ASC
         LIMIT 200`,
        [status],
      );

      return res.json({ reports: result.rows });
    } catch (error) {
      console.error('Load moderation queue failed:', error);
      return res.status(500).json({ error: 'Failed to load moderation queue' });
    }
  });

  // Update report status and record the administrator responsible for review.
  router.patch('/api/messages/moderation/reports/:reportId', requireAuth, async (req, res) => {
    const moderatorId = res.locals.authenticatedUserId as string;
    const { status, moderatorNotes } = req.body ?? {};
    const allowedStatuses = ['UNDER_REVIEW', 'RESOLVED', 'DISMISSED'];

    const isUuid = (value: unknown): value is string =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    if (!isUuid(req.params.reportId)) {
      return res.status(400).json({ error: 'Invalid report ID' });
    }

    if (typeof status !== 'string' || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Select a valid moderation status' });
    }

    if (
      moderatorNotes !== undefined &&
      moderatorNotes !== null &&
      (typeof moderatorNotes !== 'string' || moderatorNotes.length > 2000)
    ) {
      return res.status(400).json({
        error: 'Moderator notes must be 2000 characters or fewer',
      });
    }

    try {
      const access = await query(
        'SELECT 1 FROM platform_admins WHERE user_id = $1 LIMIT 1',
        [moderatorId],
      );

      if (access.rows.length === 0) {
        return res.status(403).json({ error: 'Platform moderator access required' });
      }

      const updated = await query(
        `UPDATE user_reports
         SET status = $2,
             moderator_id = $3,
             moderator_notes = $4,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, moderator_id AS "moderatorId",
                   moderator_notes AS "moderatorNotes",
                   reviewed_at AS "reviewedAt", updated_at AS "updatedAt"`,
        [
          req.params.reportId,
          status,
          moderatorId,
          typeof moderatorNotes === 'string' ? moderatorNotes.trim() || null : null,
        ],
      );

      if (updated.rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }

      return res.json({ ok: true, report: updated.rows[0] });
    } catch (error) {
      console.error('Update moderation report failed:', error);
      return res.status(500).json({ error: 'Failed to update report' });
    }
  });

  app.use(router);
}

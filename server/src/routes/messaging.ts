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
  const { pool, query, requireAuth } = context;
  const getIO = () => context.io;

  router.get('/api/messages/conversations', requireAuth, async (_req, res) => {
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
                ) THEN NULL ELSE m.body END AS last_message,
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
                ) END AS unread_count
         FROM conversations c
         JOIN users u ON u.id = CASE
           WHEN c.user_one_id = $1 THEN c.user_two_id ELSE c.user_one_id END
         LEFT JOIN LATERAL (
           SELECT body, created_at FROM messages
           WHERE conversation_id = c.id
           ORDER BY created_at DESC LIMIT 1
         ) m ON TRUE
         JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
         WHERE c.user_one_id = $1 OR c.user_two_id = $1
         ORDER BY m.created_at DESC NULLS LAST, c.updated_at DESC`,
        [userId],
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
               'deleted_at', rm.deleted_at
             ) END AS reply_to
           FROM (
             SELECT *
             FROM messages
             WHERE conversation_id = $1
             ORDER BY created_at DESC
             LIMIT 100
           ) m
           LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
           ORDER BY m.created_at ASC`,
          [req.params.conversationId],
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
        await client.query('COMMIT');
        res.json({ messages: result.rows });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error('Read messages failed:', error);
        res.status(500).json({ error: 'Failed to load messages' });
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
            `INSERT INTO notifications (user_id, type, title, message, dedupe_key)
             VALUES ($1, 'NEW_MESSAGE', 'New message', 'You received a new message.',
                     $2)
             ON CONFLICT (dedupe_key) DO NOTHING`,
            [otherUserId, `message:${message.id}`],
          );
        }

        await client.query('COMMIT');

        if (isNewMessage) {
          getIO()?.to(`conversation:${req.params.conversationId}`)
            .emit('message:new', message);
          getIO()?.to(`user:${otherUserId}`)
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
        await client.query('COMMIT');
        getIO()?.to(`conversation:${req.params.conversationId}`)
          .emit('message:updated', updated.rows[0]);
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
        await client.query('COMMIT');
        getIO()?.to(`conversation:${req.params.conversationId}`)
          .emit('message:deleted', {
            id: req.params.messageId,
            deleted_at: new Date().toISOString(),
          });
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

  app.use(router);
}

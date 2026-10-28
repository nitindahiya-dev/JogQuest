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

  async function blockedBetween(a: string, b: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM user_blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [a, b],
    );
    return result.rows.length > 0;
  }

  router.get('/api/messages/conversations', requireAuth, async (_req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const result = await query(
        `SELECT c.id,
                CASE WHEN c.user_one_id = $1 THEN c.user_two_id ELSE c.user_one_id END AS other_user_id,
                u.username AS other_username,
                u.display_name AS other_display_name,
                u.avatar_url AS other_avatar_url,
                m.body AS last_message,
                m.created_at AS last_message_at,
                (SELECT COUNT(*)::int
                   FROM messages unread
                   JOIN conversation_participants cp
                     ON cp.conversation_id = unread.conversation_id
                  WHERE unread.conversation_id = c.id
                    AND unread.sender_id <> $1
                    AND (cp.user_id = $1)
                    AND (cp.last_read_at IS NULL OR unread.created_at > cp.last_read_at)
                ) AS unread_count
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

      const conversations = [];
      for (const row of result.rows) {
        if (!(await blockedBetween(userId, row.other_user_id))) {
          conversations.push(row);
        } else {
          conversations.push({
            ...row,
            last_message: null,
            unread_count: 0,
          });
        }
      }
      res.json({ conversations });
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
          `SELECT id, sender_id, body, created_at
           FROM (
             SELECT id, sender_id, body, created_at
             FROM messages
             WHERE conversation_id = $1
             ORDER BY created_at DESC
             LIMIT 100
           ) recent
           ORDER BY created_at ASC`,
          [req.params.conversationId],
        );
        await client.query(
          `UPDATE conversation_participants
           SET last_read_at = NOW()
           WHERE conversation_id = $1 AND user_id = $2`,
          [req.params.conversationId, userId],
        );
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

        const inserted = await client.query(
          `INSERT INTO messages (conversation_id, sender_id, body)
           VALUES ($1, $2, $3)
           RETURNING id, sender_id, body, created_at`,
          [req.params.conversationId, userId, body],
        );
        await client.query(
          `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
          [req.params.conversationId],
        );
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message, dedupe_key)
           VALUES ($1, 'NEW_MESSAGE', 'New message', 'You received a new message.',
                   $2)
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [otherUserId, `message:${inserted.rows[0].id}`],
        );
        await client.query('COMMIT');
        res.status(201).json({ message: inserted.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error('Send message failed:', error);
        res.status(500).json({ error: 'Failed to send message' });
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

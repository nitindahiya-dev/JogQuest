import { Router, type Express } from 'express';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerPostsRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { query, requireAuth } = context;

router.post('/api/posts', requireAuth, async (req, res) => {
  try {
    const userId = res.locals.authenticatedUserId as string;
    const { content, activityId } = req.body;

    const cleanContent =
      typeof content === 'string'
        ? content.trim()
        : '';

    if (!cleanContent && !activityId) {
      return res.status(400).json({
        error:
          'content or activityId is required',
      });
    }

    if (cleanContent.length > 500) {
      return res.status(400).json({
        error:
          'Post content cannot exceed 500 characters',
      });
    }

    const userResult = await query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    if (activityId) {
      const activityResult = await query(
        `
        SELECT id
        FROM activities
        WHERE id = $1
          AND user_id = $2
        `,
        [activityId, userId],
      );

      if (activityResult.rows.length === 0) {
        return res.status(400).json({
          error:
            'Activity does not belong to this user',
        });
      }
    }

    const result = await query(
      `
      INSERT INTO posts (
        user_id,
        activity_id,
        content
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        user_id,
        activity_id,
        content,
        created_at
      `,
      [
        userId,
        activityId ?? null,
        cleanContent,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to create post',
    });
  }
});

router.put('/api/posts/:postId', requireAuth, async (req, res) => {
  try {
    const userId = res.locals.authenticatedUserId as string;
    const { postId } = req.params;
    const content =
      typeof req.body.content === 'string' ? req.body.content.trim() : '';

    if (!content) {
      return res.status(400).json({ error: 'Post content cannot be empty' });
    }
    if (content.length > 500) {
      return res.status(400).json({ error: 'Post content cannot exceed 500 characters' });
    }

    const result = await query(
      `UPDATE posts
       SET content = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, content, created_at`,
      [content, postId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Post not found or you do not own this post',
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Edit post failed:', error);
    return res.status(500).json({ error: 'Failed to update post' });
  }
});

router.delete('/api/posts/:postId', requireAuth, async (req, res) => {
  try {
    const userId = res.locals.authenticatedUserId as string;
    const { postId } = req.params;

    const result = await query(
      `DELETE FROM posts
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [postId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Post not found or you do not own this post',
      });
    }

    return res.json({ deleted: true, id: result.rows[0].id });
  } catch (error) {
    console.error('Delete post failed:', error);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

  app.use(router);
}

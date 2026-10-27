import { Router, type Express } from 'express';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerSocialRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { query, requireAuth } = context;

router.get(
  '/api/users/:userId/notifications',
  requireAuth,
  async (req, res) => {
    try {
      const { userId } = req.params;

      if (userId !== res.locals.authenticatedUserId) {
        res.status(403).json({
          error: 'Forbidden',
        });
        return;
      }

      const parsedLimit = Number.parseInt(
        String(req.query.limit ?? '50'),
        10,
      );

      const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 100)
        : 50;

      const result = await query(
        `
        SELECT
          id,
          type,
          title,
          message,
          territory_id,
          challenge_id,
          activity_id,
          competition_id,
          created_at,
          read_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [userId, limit],
      );

      const unreadResult = await query(
        `
        SELECT
          COUNT(*)::int AS unread_count
        FROM notifications
        WHERE user_id = $1
          AND read_at IS NULL
        `,
        [userId],
      );

      res.json({
        unreadCount: Number(
          unreadResult.rows[0]?.unread_count ?? 0,
        ),
        notifications: result.rows,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to fetch notifications',
      });
    }
  },
);

router.patch(
  '/api/notifications/:id/read',
  requireAuth,
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await query(
        `
        UPDATE notifications
        SET read_at = COALESCE(read_at, NOW())
        WHERE id = $1
          AND user_id = $2
        RETURNING
          id,
          read_at
        `,
        [
          id,
          res.locals.authenticatedUserId,
        ],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Notification not found',
        });
      }

      res.json({
        ok: true,
        notification: result.rows[0],
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to mark notification as read',
      });
    }
  },
);

router.patch(
  '/api/users/:userId/notifications/read-all',
  requireAuth,
  async (req, res) => {
    try {
      const { userId } = req.params;

      if (userId !== res.locals.authenticatedUserId) {
        res.status(403).json({
          error: 'Forbidden',
        });
        return;
      }

      const result = await query(
        `
        UPDATE notifications
        SET read_at = NOW()
        WHERE user_id = $1
          AND read_at IS NULL
        `,
        [userId],
      );

      res.json({
        ok: true,
        updated: result.rowCount ?? 0,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to mark notifications as read',
      });
    }
  },
);

router.get('/api/feed/:userId', requireAuth, async (req, res) => {
  try {
    const userId = res.locals.authenticatedUserId as string;

    const requestedScope =
      String(req.query.scope ?? 'all');

    const scope =
      requestedScope === 'following'
        ? 'following'
        : 'all';

    const parsedLimit = Number.parseInt(
      String(req.query.limit ?? '50'),
      10,
    );

    const parsedOffset = Number.parseInt(
      String(req.query.offset ?? '0'),
      10,
    );

    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 50;

    const offset = Number.isFinite(parsedOffset)
      ? Math.max(parsedOffset, 0)
      : 0;

    const result = await query(
      `
      SELECT
        p.id,
        p.user_id,
        p.activity_id,
        p.content,
        p.media_url,
        p.media_type,
        p.created_at,

        u.username,
        u.display_name,
        u.avatar_url,

        a.activity_type,
        a.distance_km,
        a.elapsed_seconds,
        a.pace,
        a.started_at,
        a.finished_at,

        (
          SELECT COUNT(*)::int
          FROM post_likes pl
          WHERE pl.post_id = p.id
        ) AS likes_count,

        (
          SELECT COUNT(*)::int
          FROM post_comments pc
          WHERE pc.post_id = p.id
        ) AS comments_count,

        EXISTS (
          SELECT 1
          FROM post_likes my_like
          WHERE my_like.post_id = p.id
            AND my_like.user_id = $1
        ) AS liked_by_me

      FROM posts p

      JOIN users u
        ON u.id = p.user_id

      LEFT JOIN activities a
        ON a.id = p.activity_id

      WHERE
        $4 = 'all'
        OR p.user_id = $1
        OR EXISTS (
          SELECT 1
          FROM follows f
          WHERE f.follower_id = $1
            AND f.following_id = p.user_id
        )

      ORDER BY p.created_at DESC

      LIMIT $2
      OFFSET $3
      `,
      [
        userId,
        limit,
        offset,
        scope,
      ],
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to fetch feed',
    });
  }
});

router.post('/api/users/:userId/follow/:targetUserId',
  requireAuth,
  async (
    req,
    res,
  ) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const { targetUserId } = req.params;

      if (userId === targetUserId) {
        return res.status(400).json({
          error: 'You cannot follow yourself',
        });
      }

      const targetResult = await query(
        `
      SELECT id
      FROM users
      WHERE id = $1
      `,
        [targetUserId],
      );

      if (targetResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Target user not found',
        });
      }

      const result = await query(
        `
      INSERT INTO follows (
        follower_id,
        following_id
      )
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING
        follower_id,
        following_id,
        created_at
      `,
        [
          userId,
          targetUserId,
        ],
      );

      res.status(
        result.rows.length > 0
          ? 201
          : 200,
      ).json({
        following: true,
        created: result.rows.length > 0,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to follow user',
      });
    }
  });

router.delete(
  '/api/users/:userId/follow/:targetUserId',
  requireAuth, async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const { targetUserId } = req.params;

      const result = await query(
        `
        DELETE FROM follows
        WHERE follower_id = $1
          AND following_id = $2
        `,
        [
          userId,
          targetUserId,
        ],
      );

      res.json({
        following: false,
        removed: (result.rowCount ?? 0) > 0,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to unfollow user',
      });
    }
  },
);

router.get(
  '/api/users/:userId/follow/:targetUserId',
  async (req, res) => {
    try {
      const {
        userId,
        targetUserId,
      } = req.params;

      const result = await query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM follows
          WHERE follower_id = $1
            AND following_id = $2
        ) AS following
        `,
        [
          userId,
          targetUserId,
        ],
      );

      res.json({
        following:
          result.rows[0]?.following ?? false,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch follow status',
      });
    }
  },
);

router.post(
  '/api/posts/:postId/like/:userId',
  requireAuth,
  async (req, res) => {
    try {
      const postId = req.params.postId;
      const userId = res.locals.authenticatedUserId as string;

      const postResult = await query(
        `
        SELECT id
        FROM posts
        WHERE id = $1
        `,
        [postId],
      );

      if (postResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Post not found',
        });
      }

      const result = await query(
        `
        INSERT INTO post_likes (
          post_id,
          user_id
        )
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING
          post_id,
          user_id,
          created_at
        `,
        [
          postId,
          userId,
        ],
      );

      res.json({
        liked: true,
        created: result.rows.length > 0,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to like post',
      });
    }
  },
);

router.delete(
  '/api/posts/:postId/like/:userId',
  requireAuth, async (req, res) => {
    try {
      const postId = req.params.postId;
      const userId = res.locals.authenticatedUserId as string;

      const result = await query(
        `
        DELETE FROM post_likes
        WHERE post_id = $1
          AND user_id = $2
        `,
        [
          postId,
          userId,
        ],
      );

      res.json({
        liked: false,
        removed: (result.rowCount ?? 0) > 0,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to unlike post',
      });
    }
  },
);

router.get(
  '/api/posts/:postId/comments',
  async (req, res) => {
    try {
      const { postId } = req.params;

      const result = await query(
        `
        SELECT
          pc.id,
          pc.post_id,
          pc.user_id,
          pc.comment,
          pc.created_at,

          u.username,
          u.display_name,
          u.avatar_url

        FROM post_comments pc

        JOIN users u
          ON u.id = pc.user_id

        WHERE pc.post_id = $1

        ORDER BY pc.created_at ASC
        `,
        [postId],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to fetch comments',
      });
    }
  },
);

router.post(
  '/api/posts/:postId/comments',
  requireAuth,
  async (req, res) => {
    try {
      const { postId } = req.params;

      const userId = res.locals.authenticatedUserId as string;
      const { comment } = req.body;

      const cleanComment =
        typeof comment === 'string'
          ? comment.trim()
          : '';

      if (!cleanComment) {
        return res.status(400).json({ error: 'comment is required' });
      }

      if (cleanComment.length > 500) {
        return res.status(400).json({
          error:
            'Comment cannot exceed 500 characters',
        });
      }

      const postResult = await query(
        `
        SELECT id
        FROM posts
        WHERE id = $1
        `,
        [postId],
      );

      if (postResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Post not found',
        });
      }

      const result = await query(
        `
        INSERT INTO post_comments (
          post_id,
          user_id,
          comment
        )
        VALUES ($1, $2, $3)
        RETURNING
          id,
          post_id,
          user_id,
          comment,
          created_at
        `,
        [
          postId,
          userId,
          cleanComment,
        ],
      );

      res.status(201).json(
        result.rows[0],
      );
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to create comment',
      });
    }
  },
);

router.get(
  '/api/users/:userId/social-profile',
  async (req, res) => {
    try {
      const { userId } = req.params;

      const viewerId =
        typeof req.query.viewerId === 'string'
          ? req.query.viewerId
          : userId;

      const result = await query(
        `
        WITH activity_stats AS (
          SELECT
            user_id,
            COUNT(*)::int AS activities_count,
            COALESCE(
              SUM(distance_km),
              0
            )::double precision AS total_distance_km
          FROM activities
          GROUP BY user_id
        ),

        territory_stats AS (
          SELECT
            user_id,
            COUNT(*)::int AS territories_captured,
            COALESCE(
              SUM(area_km2),
              0
            )::double precision AS territory_km2
          FROM territories
          GROUP BY user_id
        ),

        defense_stats AS (
          SELECT
            new_owner_id AS user_id,
            COUNT(*)::int AS territories_defended
          FROM territory_history
          WHERE
            action = 'CHALLENGE_REJECTED'
          GROUP BY new_owner_id
        ),

        follower_stats AS (
          SELECT
            following_id AS user_id,
            COUNT(*)::int AS followers_count
          FROM follows
          GROUP BY following_id
        ),

        following_stats AS (
          SELECT
            follower_id AS user_id,
            COUNT(*)::int AS following_count
          FROM follows
          GROUP BY follower_id
        ),

        ranked_users AS (
          SELECT
            u.id,
            u.username,
            u.display_name,
            u.avatar_url,

            COALESCE(
              a.activities_count,
              0
            )::int AS activities_count,

            COALESCE(
              a.total_distance_km,
              0
            )::double precision
              AS total_distance_km,

            COALESCE(
              t.territories_captured,
              0
            )::int AS territories_captured,

            COALESCE(
              t.territory_km2,
              0
            )::double precision
              AS territory_km2,

            COALESCE(
              d.territories_defended,
              0
            )::int AS territories_defended,

            COALESCE(
              fs.followers_count,
              0
            )::int AS followers_count,

            COALESCE(
              fgs.following_count,
              0
            )::int AS following_count,

            DENSE_RANK() OVER (
              ORDER BY
                COALESCE(
                  t.territory_km2,
                  0
                ) DESC,

                COALESCE(
                  a.total_distance_km,
                  0
                ) DESC
            )::int AS rank

          FROM users u

          LEFT JOIN activity_stats a
            ON a.user_id = u.id

          LEFT JOIN territory_stats t
            ON t.user_id = u.id

          LEFT JOIN defense_stats d
            ON d.user_id = u.id

          LEFT JOIN follower_stats fs
            ON fs.user_id = u.id

          LEFT JOIN following_stats fgs
            ON fgs.user_id = u.id
        )

        SELECT
          r.*,

          GREATEST(
            1,
            FLOOR(
              r.total_distance_km / 10
            ) + 1
          )::int AS level,

          EXISTS (
            SELECT 1
            FROM follows f
            WHERE
              f.follower_id = $2
              AND f.following_id = r.id
          ) AS followed_by_viewer

        FROM ranked_users r

        WHERE r.id = $1
        `,
        [
          userId,
          viewerId,
        ],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
        });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch social profile',
      });
    }
  },
);

router.get(
  '/api/users/:userId/followers',
  async (req, res) => {
    try {
      const { userId } = req.params;

      const result = await query(
        `
        SELECT
          u.id,
          u.username,
          u.display_name,
          u.avatar_url,
          f.created_at
        FROM follows f
        JOIN users u
          ON u.id = f.follower_id
        WHERE
          f.following_id = $1
        ORDER BY
          f.created_at DESC
        `,
        [userId],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch followers',
      });
    }
  },
);

router.get(
  '/api/users/:userId/following',
  async (req, res) => {
    try {
      const { userId } = req.params;

      const result = await query(
        `
        SELECT
          u.id,
          u.username,
          u.display_name,
          u.avatar_url,
          f.created_at
        FROM follows f
        JOIN users u
          ON u.id = f.following_id
        WHERE
          f.follower_id = $1
        ORDER BY
          f.created_at DESC
        `,
        [userId],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch following',
      });
    }
  },
);

  app.use(router);
}

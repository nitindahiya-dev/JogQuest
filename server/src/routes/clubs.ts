import { Router, type Express } from 'express';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerClubsRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { query, requireAuth } = context;

router.get('/api/clubs', async (_req, res) => {
  try {
    const result = await query(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        c.creator_id,
        c.is_public,
        c.created_at,

        u.username AS creator_username,
        u.display_name AS creator_display_name,

        COUNT(cm.user_id)::int AS members_count

      FROM clubs c

      JOIN users u
        ON u.id = c.creator_id

      LEFT JOIN club_members cm
        ON cm.club_id = c.id

      WHERE c.is_public = TRUE

      GROUP BY
        c.id,
        u.username,
        u.display_name

      ORDER BY
        c.created_at DESC
      `,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to fetch clubs',
    });
  }
});

router.get(
  '/api/users/:userId/clubs',
  requireAuth,
  async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;

      if (req.params.userId !== userId) {
        return res.status(403).json({
          error: 'You can only view your own clubs',
        });
      }

      const result = await query(
        `
        SELECT
          c.id,
          c.name,
          c.description,
          c.creator_id,
          c.is_public,
          c.created_at,

          COUNT(all_members.user_id)::int
            AS members_count

        FROM club_members mine

        JOIN clubs c
          ON c.id = mine.club_id

        LEFT JOIN club_members all_members
          ON all_members.club_id = c.id

        WHERE mine.user_id = $1

        GROUP BY c.id, mine.joined_at

        ORDER BY
          mine.joined_at DESC
        `,
        [userId],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to fetch user clubs',
      });
    }
  },
);

router.post('/api/clubs', requireAuth, async (req, res) => {
  try {
    const userId = res.locals.authenticatedUserId as string;
    const { name, description } = req.body;
    const isPublic = typeof req.body?.is_public === 'boolean'
      ? req.body.is_public
      : true;

    const cleanName =
      typeof name === 'string'
        ? name.trim()
        : '';

    const cleanDescription =
      typeof description === 'string'
        ? description.trim()
        : '';

    if (!cleanName) {
      return res.status(400).json({
        error:
          'name is required',
      });
    }

    if (cleanName.length > 100) {
      return res.status(400).json({
        error:
          'Club name cannot exceed 100 characters',
      });
    }

    if (cleanDescription.length > 500) {
      return res.status(400).json({
        error:
          'Club description cannot exceed 500 characters',
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

    const clubResult = await query(
      `
      INSERT INTO clubs (
        name,
        description,
        creator_id,
        is_public
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        name,
        description,
        creator_id,
        is_public,
        created_at
      `,
      [
        cleanName,
        cleanDescription,
        userId,
        isPublic,
      ],
    );

    const club =
      clubResult.rows[0];

    await query(
      `
      INSERT INTO club_members (
        club_id,
        user_id
      )
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [
        club.id,
        userId,
      ],
    );

    res.status(201).json({
      ...club,
      members_count: 1,
    });
  } catch (error) {
    console.error(error);

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    ) {
      return res.status(409).json({
        error:
          'A club with this name already exists',
      });
    }

    res.status(500).json({
      error: 'Failed to create club',
    });
  }
});

router.get(
  '/api/clubs/:clubId',
  async (req, res) => {
    try {
      const {
        clubId,
      } = req.params;

      const result = await query(
        `
        SELECT
          c.id,
          c.name,
          c.description,
          c.creator_id,
          c.is_public,
          c.created_at,

          u.username AS creator_username,
          u.display_name AS creator_display_name,

          COUNT(cm.user_id)::int
            AS members_count

        FROM clubs c

        JOIN users u
          ON u.id = c.creator_id

        LEFT JOIN club_members cm
          ON cm.club_id = c.id

        WHERE c.id = $1

        GROUP BY
          c.id,
          u.username,
          u.display_name
        `,
        [clubId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Club not found',
        });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch club details',
      });
    }
  },
);

router.get(
  '/api/clubs/:clubId/members',
  async (req, res) => {
    try {
      const { clubId } = req.params;

      const clubResult = await query<{ is_public: boolean; creator_id: string }>(
        `SELECT is_public, creator_id FROM clubs WHERE id = $1`,
        [clubId],
      );

      if (clubResult.rows.length === 0) {
        return res.status(404).json({ error: 'Club not found' });
      }

      const club = clubResult.rows[0];

      if (!club.is_public) {
        const userId = res.locals.authenticatedUserId as string | undefined;

        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        if (userId !== club.creator_id) {
          const membershipResult = await query(
            `SELECT 1 FROM club_members WHERE club_id = $1 AND user_id = $2`,
            [clubId, userId],
          );

          if (membershipResult.rows.length === 0) {
            return res.status(403).json({
              error: 'Only private-club members can view the member list',
            });
          }
        }
      }

      const result = await query(
        `
        SELECT
          u.id,
          u.username,
          u.display_name,
          u.avatar_url,
          cm.joined_at
        FROM club_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.club_id = $1
        ORDER BY cm.joined_at ASC
        `,
        [clubId],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch club members' });
    }
  },
);

router.post(
  '/api/clubs/:clubId/join/:userId',
  requireAuth, async (req, res) => {
    try {
      const { clubId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      const clubResult = await query(
        `
        SELECT
          id,
          is_public
        FROM clubs
        WHERE id = $1
        `,
        [clubId],
      );

      if (clubResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Club not found',
        });
      }

      if (
        !clubResult.rows[0].is_public
      ) {
        return res.status(403).json({
          error: 'This club is private',
        });
      }

      const result = await query(
        `
        INSERT INTO club_members (
          club_id,
          user_id
        )
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING
          club_id,
          user_id,
          joined_at
        `,
        [
          clubId,
          userId,
        ],
      );

      res.json({
        joined: true,
        created:
          result.rows.length > 0,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to join club',
      });
    }
  },
);

router.delete(
  '/api/clubs/:clubId/join/:userId',
  requireAuth, async (req, res) => {
    try {
      const { clubId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      const creatorResult = await query(
        `
        SELECT creator_id
        FROM clubs
        WHERE id = $1
        `,
        [clubId],
      );

      if (
        creatorResult.rows.length === 0
      ) {
        return res.status(404).json({
          error: 'Club not found',
        });
      }

      if (
        creatorResult.rows[0].creator_id ===
        userId
      ) {
        return res.status(400).json({
          error:
            'Club creator cannot leave the club',
        });
      }

      const result = await query(
        `
        DELETE FROM club_members
        WHERE club_id = $1
          AND user_id = $2
        `,
        [
          clubId,
          userId,
        ],
      );

      res.json({
        joined: false,
        removed:
          (result.rowCount ?? 0) > 0,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Failed to leave club',
      });
    }
  },
);

router.get(
  '/api/clubs/:clubId/membership/:userId',
  requireAuth,
  async (req, res) => {
    try {
      const { clubId, userId } = req.params;
      const authenticatedUserId = res.locals.authenticatedUserId as string;

      if (userId !== authenticatedUserId) {
        return res.status(403).json({
          error: 'You can only check your own membership status',
        });
      }

      const result = await query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM club_members
          WHERE club_id = $1
            AND user_id = $2
        ) AS joined
        `,
        [clubId, authenticatedUserId],
      );

      res.json({
        joined: result.rows[0]?.joined ?? false,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch membership status' });
    }
  },
);


  router.get(
    '/api/clubs/:clubId/requests/me',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId } = req.params;
        const result = await query(
          `SELECT id, status, created_at
           FROM club_join_requests
           WHERE club_id = $1 AND user_id = $2`,
          [clubId, userId],
        );
        return res.json(result.rows[0] ?? { status: null });
      } catch (error) {
        console.error('Failed to load own club join request:', error);
        return res.status(500).json({ error: 'Failed to load request status' });
      }
    },
  );

  // JOIN REQUESTS: SUBMIT, LIST, REVIEW
  router.post(
    '/api/clubs/:clubId/requests',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId } = req.params;

        const clubResult = await query(
          `SELECT id, creator_id, is_public FROM clubs WHERE id = $1`,
          [clubId],
        );

        if (clubResult.rows.length === 0) {
          return res.status(404).json({ error: 'Club not found' });
        }

        const club = clubResult.rows[0];

        if (club.is_public) {
          return res.status(400).json({
            error: 'This club is public. Join it directly instead.',
          });
        }

        if (club.creator_id === userId) {
          return res.status(400).json({
            error: 'You own this club already',
          });
        }

        const memberResult = await query(
          `SELECT 1 FROM club_members WHERE club_id = $1 AND user_id = $2`,
          [clubId, userId],
        );

        if (memberResult.rows.length > 0) {
          return res.status(409).json({
            error: 'You are already a member of this club',
          });
        }

        const result = await query(
          `INSERT INTO club_join_requests (club_id, user_id, status)
           VALUES ($1, $2, 'pending')
           ON CONFLICT (club_id, user_id)
           DO UPDATE SET
             status = CASE
               WHEN club_join_requests.status = 'rejected' THEN 'pending'
               ELSE club_join_requests.status
             END,
             created_at = CASE
               WHEN club_join_requests.status = 'rejected' THEN NOW()
               ELSE club_join_requests.created_at
             END,
             reviewed_at = CASE
               WHEN club_join_requests.status = 'rejected' THEN NULL
               ELSE club_join_requests.reviewed_at
             END
           RETURNING id, status, created_at`,
          [clubId, userId],
        );

        const request = result.rows[0];
        return res.status(request.status === 'pending' ? 201 : 200).json(request);
      } catch (error) {
        console.error('Failed to submit club join request:', error);
        return res.status(500).json({ error: 'Failed to submit join request' });
      }
    },
  );

  router.get(
    '/api/clubs/:clubId/requests',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId } = req.params;

        const owner = await query(
          `SELECT 1 FROM clubs WHERE id = $1 AND creator_id = $2`,
          [clubId, userId],
        );

        if (owner.rows.length === 0) {
          return res.status(403).json({
            error: 'Only the club owner can view join requests',
          });
        }

        const result = await query(
          `SELECT r.id, r.club_id, r.user_id, r.status, r.created_at,
                  u.username, u.display_name, u.avatar_url
           FROM club_join_requests r
           JOIN users u ON u.id = r.user_id
           WHERE r.club_id = $1 AND r.status = 'pending'
           ORDER BY r.created_at ASC`,
          [clubId],
        );

        return res.json(result.rows);
      } catch (error) {
        console.error('Failed to load club join requests:', error);
        return res.status(500).json({ error: 'Failed to load join requests' });
      }
    },
  );

  router.patch(
    '/api/clubs/:clubId/requests/:requestId',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId, requestId } = req.params;
        const status = req.body?.status;

        if (status !== 'approved' && status !== 'rejected') {
          return res.status(400).json({
            error: 'Status must be approved or rejected',
          });
        }

        // A single statement checks ownership, updates the request, and
        // inserts membership only when approval succeeds.
        const result = await query(
          `WITH owner AS (
             SELECT id FROM clubs
             WHERE id = $1 AND creator_id = $2 AND is_public = FALSE
           ),
           updated AS (
             UPDATE club_join_requests r
             SET status = $4, reviewed_at = NOW()
             FROM owner o
             WHERE r.id = $3
               AND r.club_id = o.id
               AND r.status = 'pending'
             RETURNING r.id, r.club_id, r.user_id, r.status
           ),
           added AS (
             INSERT INTO club_members (club_id, user_id)
             SELECT club_id, user_id FROM updated WHERE status = 'approved'
             ON CONFLICT DO NOTHING
             RETURNING club_id, user_id
           )
           SELECT * FROM updated`,
          [clubId, userId, requestId, status],
        );

        if (result.rows.length === 0) {
          const owner = await query(
            `SELECT 1 FROM clubs WHERE id = $1 AND creator_id = $2`,
            [clubId, userId],
          );

          if (owner.rows.length === 0) {
            return res.status(403).json({
              error: 'Only the club owner can review requests',
            });
          }

          return res.status(404).json({
            error: 'Pending join request not found',
          });
        }

        return res.json(result.rows[0]);
      } catch (error) {
        console.error('Failed to review club join request:', error);
        return res.status(500).json({ error: 'Failed to review join request' });
      }
    },
  );

  app.use(router);
}

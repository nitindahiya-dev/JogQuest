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
  const { query, requireAuth, createClient, multer, randomUUID } = context;

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
        user_id,
        role
      )
      VALUES ($1, $2, 'owner')
      ON CONFLICT (club_id, user_id)
      DO UPDATE SET role = 'owner'
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
  requireAuth,
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

      const club = result.rows[0];

      if (!club.is_public) {
        const userId = res.locals.authenticatedUserId as string | undefined;

        if (!userId) {
          return res.status(401).json({
            error: 'Authentication required',
          });
        }

        if (userId !== club.creator_id) {
          const membership = await query(
            `SELECT 1 FROM club_members WHERE club_id = $1 AND user_id = $2`,
            [clubId, userId],
          );

          if (membership.rows.length === 0) {
            return res.status(403).json({
              error: 'Only private-club members can view this club',
            });
          }
        }
      }

      res.json(club);
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
  requireAuth,
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

        const actor = await getClubRole(clubId, userId);

        if (
          !actor ||
          !actor.is_member ||
          (actor.role !== 'owner' && actor.role !== 'admin')
        ) {
          return res.status(403).json({
            error: 'Only club owners and admins can view join requests',
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
          `WITH manager AS (
             SELECT c.id
             FROM clubs c
             LEFT JOIN club_members cm
               ON cm.club_id = c.id
              AND cm.user_id = $2
             WHERE c.id = $1
               AND c.is_public = FALSE
               AND (
                 c.creator_id = $2
                 OR cm.role IN ('owner', 'admin')
               )
           ),
           updated AS (
             UPDATE club_join_requests r
             SET status = $4, reviewed_at = NOW()
             FROM manager m
             WHERE r.id = $3
               AND r.club_id = m.id
               AND r.status = 'pending'
             RETURNING r.id, r.club_id, r.user_id, r.status
           ),
           added AS (
             INSERT INTO club_members (club_id, user_id, role)
             SELECT club_id, user_id, 'member'
             FROM updated
             WHERE status = 'approved'
             ON CONFLICT (club_id, user_id) DO NOTHING
             RETURNING club_id, user_id
           )
           SELECT * FROM updated`,
          [clubId, userId, requestId, status],
        );

        if (result.rows.length === 0) {
          const actor = await getClubRole(clubId, userId);

          if (
            !actor ||
            !actor.is_member ||
            (actor.role !== 'owner' && actor.role !== 'admin')
          ) {
            return res.status(403).json({
              error: 'Only club owners and admins can review requests',
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


  // Resolve effective club role. Ownership always comes from clubs.creator_id.
  const getClubRole = async (clubId: string, userId: string) => {
    const result = await query<{
      role: 'owner' | 'admin' | 'member' | null;
      is_member: boolean;
    }>(
      `
      SELECT
        CASE
          WHEN c.creator_id = $2 THEN 'owner'
          ELSE cm.role
        END AS role,
        (cm.user_id IS NOT NULL OR c.creator_id = $2) AS is_member
      FROM clubs c
      LEFT JOIN club_members cm
        ON cm.club_id = c.id
       AND cm.user_id = $2
      WHERE c.id = $1
      `,
      [clubId, userId],
    );

    return result.rows[0] ?? null;
  };

  // Return member roles to authenticated club members.
  router.get(
    '/api/clubs/:clubId/roles',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId } = req.params;
        const actor = await getClubRole(clubId, userId);

        if (!actor) {
          return res.status(404).json({ error: 'Club not found' });
        }

        if (!actor.is_member) {
          return res.status(403).json({
            error: 'Only club members can view member roles',
          });
        }

        const result = await query(
          `
          SELECT
            u.id,
            u.username,
            u.display_name,
            CASE
              WHEN c.creator_id = u.id THEN 'owner'
              ELSE cm.role
            END AS role
          FROM club_members cm
          JOIN clubs c ON c.id = cm.club_id
          JOIN users u ON u.id = cm.user_id
          WHERE cm.club_id = $1
          ORDER BY
            CASE
              WHEN c.creator_id = u.id THEN 0
              WHEN cm.role = 'admin' THEN 1
              ELSE 2
            END,
            cm.joined_at ASC
          `,
          [clubId],
        );

        return res.json(result.rows);
      } catch (error) {
        console.error('Failed to fetch club roles:', error);
        return res.status(500).json({
          error: 'Failed to fetch club roles',
        });
      }
    },
  );

  // Only the owner can promote or demote admins.
  router.patch(
    '/api/clubs/:clubId/members/:memberId/role',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId, memberId } = req.params;
        const role = req.body?.role;

        if (role !== 'admin' && role !== 'member') {
          return res.status(400).json({
            error: 'Role must be admin or member',
          });
        }

        if (memberId === userId) {
          return res.status(400).json({
            error: 'You cannot change your own role',
          });
        }

        const actor = await getClubRole(clubId, userId);

        if (!actor) {
          return res.status(404).json({ error: 'Club not found' });
        }

        if (actor.role !== 'owner') {
          return res.status(403).json({
            error: 'Only the club owner can manage admin roles',
          });
        }

        const target = await getClubRole(clubId, memberId);

        if (!target || !target.is_member) {
          return res.status(404).json({
            error: 'Club member not found',
          });
        }

        if (target.role === 'owner') {
          return res.status(400).json({
            error: 'The owner role cannot be changed',
          });
        }

        await query(
          `
          UPDATE club_members
          SET role = $3
          WHERE club_id = $1
            AND user_id = $2
          `,
          [clubId, memberId, role],
        );

        return res.json({
          updated: true,
          user_id: memberId,
          role,
        });
      } catch (error) {
        console.error('Failed to update club member role:', error);
        return res.status(500).json({
          error: 'Failed to update member role',
        });
      }
    },
  );

  // Owner and admins can remove ordinary members.
  // Admins cannot remove the owner or another admin.
  router.delete(
    '/api/clubs/:clubId/members/:memberId',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId, memberId } = req.params;

        if (userId === memberId) {
          return res.status(400).json({
            error: 'Use the leave-club action to remove yourself',
          });
        }

        const actor = await getClubRole(clubId, userId);

        if (!actor) {
          return res.status(404).json({ error: 'Club not found' });
        }

        if (
          !actor.is_member ||
          (actor.role !== 'owner' && actor.role !== 'admin')
        ) {
          return res.status(403).json({
            error: 'Only club owners and admins can remove members',
          });
        }

        const target = await getClubRole(clubId, memberId);

        if (!target || !target.is_member) {
          return res.status(404).json({
            error: 'Club member not found',
          });
        }

        if (target.role === 'owner') {
          return res.status(403).json({
            error: 'The club owner cannot be removed',
          });
        }

        if (actor.role === 'admin' && target.role === 'admin') {
          return res.status(403).json({
            error: 'Admins cannot remove other admins',
          });
        }

        const result = await query(
          `
          DELETE FROM club_members
          WHERE club_id = $1
            AND user_id = $2
          `,
          [clubId, memberId],
        );

        return res.json({
          removed: (result.rowCount ?? 0) > 0,
          user_id: memberId,
        });
      } catch (error) {
        console.error('Failed to remove club member:', error);
        return res.status(500).json({
          error: 'Failed to remove club member',
        });
      }
    },
  );


  // CLUB FEED: existing posts, likes and comments are reused.
  router.get(
    '/api/clubs/:clubId/posts',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId } = req.params;

        const result = await query(
          `SELECT
             p.id, p.user_id, p.activity_id, p.content,
             p.media_url, p.media_type, p.created_at,
             u.username, u.display_name, u.avatar_url,
             a.activity_type, a.distance_km, a.elapsed_seconds,
             a.pace, a.started_at, a.finished_at,
             (SELECT COUNT(*)::int FROM post_likes pl
              WHERE pl.post_id = p.id) AS likes_count,
             (SELECT COUNT(*)::int FROM post_comments pc
              WHERE pc.post_id = p.id) AS comments_count,
             EXISTS (
               SELECT 1 FROM post_likes mine
               WHERE mine.post_id = p.id AND mine.user_id = $2
             ) AS liked_by_me
           FROM clubs c
           JOIN posts p ON p.club_id = c.id
           JOIN users u ON u.id = p.user_id
           LEFT JOIN activities a ON a.id = p.activity_id
           WHERE c.id = $1
             AND (c.is_public = TRUE OR EXISTS (
               SELECT 1 FROM club_members cm
               WHERE cm.club_id = c.id AND cm.user_id = $2
             ))
           ORDER BY p.created_at DESC
           LIMIT 50`,
          [clubId, userId],
        );

        const clubCheck = await query(
          `SELECT id FROM clubs WHERE id = $1`,
          [clubId],
        );
        if (clubCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Club not found' });
        }

        return res.json(result.rows);
      } catch (error) {
        console.error('Failed to fetch club feed:', error);
        return res.status(500).json({ error: 'Failed to fetch club feed' });
      }
    },
  );

  const clubPostMediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
    fileFilter: (_req: any, file: any, callback: any) => {
      const allowed = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/quicktime',
      ];

      if (!allowed.includes(file.mimetype)) {
        callback(new Error('Choose a JPEG, PNG, WebP, MP4, or MOV file'));
        return;
      }

      callback(null, true);
    },
  });

  const handleClubPostMediaUpload = (req: any, res: any, next: any) => {
    clubPostMediaUpload.single('media')(req, res, (error: any) => {
      if (error) {
        const message =
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Media file exceeds the 50 MB upload limit'
            : error.message || 'Media upload failed';

        return res.status(400).json({ error: message });
      }

      next();
    });
  };

  router.post(
    '/api/clubs/:clubId/posts',
    requireAuth,
    handleClubPostMediaUpload,
    async (req, res) => {
      let uploadedMediaPath: string | null = null;
      let storageClient: any = null;

      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId } = req.params;
        const content = typeof req.body?.content === 'string'
          ? req.body.content.trim()
          : '';

        const file = req.file as {
          buffer: Buffer;
          mimetype: string;
        } | undefined;

        if (!content && !file) {
          return res.status(400).json({
            error: 'Write something or attach media',
          });
        }

        if (content.length > 500) {
          return res.status(400).json({
            error: 'Post content cannot exceed 500 characters',
          });
        }

        const membership = await query(
          `SELECT 1 FROM club_members
           WHERE club_id = $1 AND user_id = $2`,
          [clubId, userId],
        );

        if (membership.rows.length === 0) {
          return res.status(403).json({
            error: 'Only club members can post',
          });
        }

        let mediaUrl: string | null = null;
        let mediaType: 'image' | 'video' | null = null;

        if (file) {
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            return res.status(503).json({
              error: 'Post media storage is not configured',
            });
          }

          const extensionByType: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'video/mp4': 'mp4',
            'video/quicktime': 'mov',
          };

          const extension = extensionByType[file.mimetype];

          if (!extension) {
            return res.status(400).json({
              error: 'Unsupported media format',
            });
          }

          storageClient = createClient(supabaseUrl, supabaseKey);
          uploadedMediaPath = `${userId}/${randomUUID()}.${extension}`;

          const { error: uploadError } = await storageClient.storage
            .from('post-media')
            .upload(uploadedMediaPath, file.buffer, {
              contentType: file.mimetype,
              upsert: false,
            });

          if (uploadError) {
            console.error('Club post media upload failed:', uploadError.message);
            return res.status(502).json({
              error: 'Could not upload media. Check the post-media storage bucket.',
            });
          }

          mediaUrl = storageClient.storage
            .from('post-media')
            .getPublicUrl(uploadedMediaPath).data.publicUrl;

          mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';
        }

        let result;

        try {
          result = await query(
            `INSERT INTO posts (
               user_id, club_id, content, media_url, media_type
             )
             VALUES ($1, $2, $3, $4, $5)
             RETURNING
               id, user_id, club_id, content,
               media_url, media_type, created_at`,
            [userId, clubId, content, mediaUrl, mediaType],
          );
        } catch (dbError) {
          if (uploadedMediaPath && storageClient) {
            try {
              const { error: cleanupError } = await storageClient.storage
                .from('post-media')
                .remove([uploadedMediaPath]);

              if (cleanupError) {
                console.error('Club media cleanup failed:', cleanupError.message);
              }
            } catch (cleanupError) {
              console.error('Club media cleanup failed:', cleanupError);
            }
          }

          throw dbError;
        }

        if (!result.rows?.[0]) {
          if (uploadedMediaPath && storageClient) {
            await storageClient.storage
              .from('post-media')
              .remove([uploadedMediaPath]);
          }

          return res.status(500).json({
            error: 'Club post could not be created',
          });
        }

        return res.status(201).json(result.rows[0]);
      } catch (error) {
        if (uploadedMediaPath && storageClient) {
          try {
            const { error: cleanupError } = await storageClient.storage
              .from('post-media')
              .remove([uploadedMediaPath]);

            if (cleanupError) {
              console.error('Club media cleanup failed:', cleanupError.message);
            }
          } catch (cleanupError) {
            console.error('Club media cleanup failed:', cleanupError);
          }
        }

        console.error('Failed to create club post:', error);
        return res.status(500).json({
          error: 'Failed to create club post',
        });
      }
    },
  );



  // Transfer ownership atomically. The previous owner becomes admin.
  router.patch(
    '/api/clubs/:clubId/transfer-ownership',
    requireAuth,
    async (req, res) => {
      const client = await context.pool.connect();

      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId } = req.params;
        const targetUserId = req.body?.newOwnerId;

        if (
          typeof targetUserId !== 'string' ||
          !targetUserId.trim()
        ) {
          return res.status(400).json({
            error: 'A new owner must be selected',
          });
        }

        if (targetUserId === userId) {
          return res.status(400).json({
            error: 'You are already the club owner',
          });
        }

        await client.query('BEGIN');

        const clubResult = await client.query(
          `SELECT id, creator_id
           FROM clubs
           WHERE id = $1
           FOR UPDATE`,
          [clubId],
        );

        if (clubResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Club not found' });
        }

        if (clubResult.rows[0].creator_id !== userId) {
          await client.query('ROLLBACK');
          return res.status(403).json({
            error: 'Only the current club owner can transfer ownership',
          });
        }

        const targetResult = await client.query(
          `SELECT user_id
           FROM club_members
           WHERE club_id = $1 AND user_id = $2
           FOR UPDATE`,
          [clubId, targetUserId],
        );

        if (targetResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({
            error: 'The selected user is not a member of this club',
          });
        }

        const previousOwnerResult = await client.query(
          `UPDATE club_members
           SET role = 'admin'
           WHERE club_id = $1 AND user_id = $2
           RETURNING user_id`,
          [clubId, userId],
        );

        if (previousOwnerResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'Current owner membership record is missing',
          });
        }

        await client.query(
          `UPDATE club_members
           SET role = 'owner'
           WHERE club_id = $1 AND user_id = $2`,
          [clubId, targetUserId],
        );

        const updatedClub = await client.query(
          `UPDATE clubs
           SET creator_id = $2
           WHERE id = $1 AND creator_id = $3
           RETURNING id, creator_id`,
          [clubId, targetUserId, userId],
        );

        if (updatedClub.rows.length === 0) {
          throw new Error('Ownership changed during transfer');
        }

        await client.query('COMMIT');

        return res.json({
          transferred: true,
          club_id: clubId,
          previous_owner_id: userId,
          new_owner_id: targetUserId,
        });
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Ownership transfer rollback failed:', rollbackError);
        }

        console.error('Failed to transfer club ownership:', error);
        return res.status(500).json({
          error: 'Failed to transfer club ownership',
        });
      } finally {
        client.release();
      }
    },
  );

  // Delete a club, its dependent database records and its own post media.
  router.delete(
    '/api/clubs/:clubId',
    requireAuth,
    async (req, res) => {
      const client = await context.pool.connect();

      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId } = req.params;
        const confirmation = req.body?.confirmation;

        if (typeof confirmation !== 'string' || !confirmation.trim()) {
          return res.status(400).json({
            error: 'Club name confirmation is required',
          });
        }

        await client.query('BEGIN');

        const clubResult = await client.query(
          `SELECT id, name, creator_id
           FROM clubs
           WHERE id = $1
           FOR UPDATE`,
          [clubId],
        );

        if (clubResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Club not found' });
        }

        const club = clubResult.rows[0];

        if (club.creator_id !== userId) {
          await client.query('ROLLBACK');
          return res.status(403).json({
            error: 'Only the club owner can delete this club',
          });
        }

        if (confirmation.trim() !== club.name) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'Club name confirmation does not match',
          });
        }

        // Collect only media belonging to this club's posts.
        const mediaResult = await client.query(
          `SELECT media_url
           FROM posts
           WHERE club_id = $1
             AND media_url IS NOT NULL`,
          [clubId],
        );

        const mediaUrls: string[] = mediaResult.rows
          .map((row: { media_url: string | null }) => row.media_url)
          .filter((url: string | null): url is string => !!url);

        const deleted = await client.query(
          `DELETE FROM clubs
           WHERE id = $1 AND creator_id = $2
           RETURNING id`,
          [clubId, userId],
        );

        if (deleted.rows.length === 0) {
          throw new Error('Club could not be deleted');
        }

        await client.query('COMMIT');

        // Storage cleanup is deliberately after the database commit.
        let storageCleanupComplete = true;
        let storageCleanupPending = 0;

        if (mediaUrls.length > 0) {
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            storageCleanupComplete = false;
            storageCleanupPending = mediaUrls.length;
            console.error(
              'Club deleted, but media cleanup is pending: Supabase storage is not configured.',
              { clubId, mediaCount: mediaUrls.length },
            );
          } else {
            try {
              const storageClient = createClient(supabaseUrl, supabaseKey);
              const configuredOrigin = new URL(supabaseUrl).origin;
              const publicPrefix = '/storage/v1/object/public/post-media/';
              const objectPaths = new Set<string>();

              for (const mediaUrl of mediaUrls) {
                try {
                  const parsed = new URL(mediaUrl);

                  if (parsed.origin !== configuredOrigin ||
                      !parsed.pathname.startsWith(publicPrefix)) {
                    console.warn('Skipping unrecognized club media URL:', mediaUrl);
                    continue;
                  }

                  const encodedPath = parsed.pathname.slice(publicPrefix.length);
                  const segments = encodedPath.split('/').map(decodeURIComponent);

                  // Match the upload format: UUID/UUID.extension.
                  const uuidPattern =
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                  const filenamePattern =
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|mp4|mov)$/i;

                  if (
                    segments.length !== 2 ||
                    !uuidPattern.test(segments[0]) ||
                    !filenamePattern.test(segments[1]) ||
                    segments.some(segment =>
                      !segment || segment === '.' || segment === '..'
                    )
                  ) {
                    console.warn('Skipping media URL with unexpected path:', mediaUrl);
                    continue;
                  }

                  objectPaths.add(segments.join('/'));
                } catch (parseError) {
                  console.warn('Skipping invalid club media URL:', mediaUrl, parseError);
                }
              }

              const paths = [...objectPaths];

              // Supabase Storage removal is batched to avoid oversized requests.
              for (let index = 0; index < paths.length; index += 100) {
                const batch = paths.slice(index, index + 100);
                const { error: storageError } = await storageClient.storage
                  .from('post-media')
                  .remove(batch);

                if (storageError) {
                  storageCleanupComplete = false;
                  storageCleanupPending += batch.length;
                  console.error('Club media storage cleanup failed:', {
                    clubId,
                    paths: batch,
                    error: storageError.message,
                  });
                }
              }
            } catch (storageError) {
              storageCleanupComplete = false;
              storageCleanupPending = mediaUrls.length;
              console.error(
                'Club deleted, but Supabase media cleanup failed:',
                { clubId, error: storageError },
              );
            }
          }
        }

        return res.json({
          deleted: true,
          club_id: clubId,
          storage_cleanup_complete: storageCleanupComplete,
          storage_cleanup_pending: storageCleanupPending,
        });
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Club deletion rollback failed:', rollbackError);
        }

        console.error('Failed to delete club:', error);
        return res.status(500).json({
          error: 'Failed to delete club',
        });
      } finally {
        client.release();
      }
    },
  );

  // Only the club owner can edit club information and visibility.
  router.patch(
    '/api/clubs/:clubId/settings',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { clubId } = req.params;
        const name = typeof req.body?.name === 'string'
          ? req.body.name.trim()
          : '';
        const description = typeof req.body?.description === 'string'
          ? req.body.description.trim()
          : '';
        const isPublic = req.body?.is_public;

        if (!name) {
          return res.status(400).json({ error: 'Club name is required' });
        }
        if (name.length > 100) {
          return res.status(400).json({ error: 'Club name cannot exceed 100 characters' });
        }
        if (description.length > 500) {
          return res.status(400).json({ error: 'Club description cannot exceed 500 characters' });
        }
        if (typeof isPublic !== 'boolean') {
          return res.status(400).json({ error: 'Club visibility must be public or private' });
        }

        const result = await query(
          `UPDATE clubs
           SET name = $3,
               description = $4,
               is_public = $5
           WHERE id = $1 AND creator_id = $2
           RETURNING id, name, description, creator_id, is_public, created_at`,
          [clubId, userId, name, description, isPublic],
        );

        if (result.rows.length === 0) {
          const exists = await query(
            'SELECT id FROM clubs WHERE id = $1',
            [clubId],
          );

          if (exists.rows.length === 0) {
            return res.status(404).json({ error: 'Club not found' });
          }
          return res.status(403).json({ error: 'Only the club owner can edit settings' });
        }

        return res.json(result.rows[0]);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '23505'
        ) {
          return res.status(409).json({ error: 'A club with this name already exists' });
        }

        console.error('Failed to update club settings:', error);
        return res.status(500).json({ error: 'Failed to update club settings' });
      }
    },
  );

  app.use(router);
}

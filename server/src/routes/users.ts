import { Router, type Express } from 'express';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerUsersRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { hashSessionToken, query } = context;

router.post('/api/users', async (req, res) => {
  try {
    const { username, displayName, avatarUrl } = req.body;

    if (!username || !displayName) {
      return res.status(400).json({
        error: 'username and displayName are required',
      });
    }

    const result = await query(
      `
      INSERT INTO users (
        username,
        display_name,
        avatar_url
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        username,
        display_name,
        avatar_url,
        created_at
      `,
      [
        username,
        displayName,
        avatarUrl ?? null,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to create user',
    });
  }
});

router.get(
  '/api/me',
  async (req, res) => {
    try {
      const authorization =
        req.headers.authorization;

      if (
        !authorization ||
        !authorization.startsWith(
          'Bearer ',
        )
      ) {
        return res.status(401).json({
          error:
            'Authentication required',
        });
      }

      const token =
        authorization.slice(7);

      const tokenHash =
        hashSessionToken(token);

      const result =
        await query(
          `
          SELECT
            u.id,
            u.username,
            u.display_name,
            u.email,
            u.avatar_url
          FROM user_sessions s
          JOIN users u
            ON u.id = s.user_id
          WHERE s.token_hash = $1
            AND s.expires_at > NOW()
          `,
          [
            tokenHash,
          ],
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(401).json({
          error:
            'Invalid or expired session',
        });
      }

      res.json(
        result.rows[0],
      );
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch current user',
      });
    }
  },
);

router.get('/api/users/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      `
      WITH activity_stats AS (
        SELECT
          user_id,
          COUNT(*)::int AS activities_count,
          COALESCE(SUM(distance_km), 0)::double precision
            AS total_distance_km
        FROM activities
        GROUP BY user_id
      ),
      territory_stats AS (
        SELECT
          user_id,
          COUNT(*)::int AS territories_captured,
          COALESCE(SUM(area_km2), 0)::double precision
            AS territory_km2
        FROM territories
        GROUP BY user_id
      ),
      defense_stats AS (
        SELECT
          new_owner_id AS user_id,
          COUNT(*)::int AS territories_defended
        FROM territory_history
        WHERE action = 'CHALLENGE_REJECTED'
        GROUP BY new_owner_id
      ),
      ranked_users AS (
        SELECT
          u.id,
          u.username,
          u.display_name,
          u.avatar_url,
          COALESCE(a.activities_count, 0) AS activities_count,
          COALESCE(a.total_distance_km, 0) AS total_distance_km,
          COALESCE(t.territories_captured, 0) AS territories_captured,
          COALESCE(t.territory_km2, 0) AS territory_km2,
          COALESCE(d.territories_defended, 0) AS territories_defended,
          DENSE_RANK() OVER (
            ORDER BY
              COALESCE(t.territory_km2, 0) DESC,
              COALESCE(a.total_distance_km, 0) DESC
          )::int AS rank
        FROM users u
        LEFT JOIN activity_stats a
          ON a.user_id = u.id
        LEFT JOIN territory_stats t
          ON t.user_id = u.id
        LEFT JOIN defense_stats d
          ON d.user_id = u.id
      )
      SELECT *
      FROM ranked_users
      WHERE id = $1
      `,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const profile = result.rows[0];

    const level =
      Math.max(
        1,
        Math.floor(
          Number(profile.total_distance_km) / 10,
        ) + 1,
      );

    res.json({
      ...profile,
      level,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to fetch user profile',
    });
  }
});

  app.use(router);
}

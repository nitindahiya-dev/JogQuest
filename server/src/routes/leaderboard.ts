import { Router, type Express } from 'express';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerLeaderboardRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { query, requireAuth } = context;

router.get(
  '/api/leaderboard',
  (req, res, next) => {
    const scope = String(req.query.scope ?? 'Global');
    if (!['Global', 'City', 'Friends'].includes(scope)) {
      return res.status(400).json({ error: 'Invalid leaderboard scope' });
    }
    if (scope === 'Global') return next();
    return requireAuth(req, res, next);
  },
  async (req, res) => {
    try {
      const scope = String(req.query.scope ?? 'Global');
      const userId = scope === 'Global'
        ? null
        : res.locals.authenticatedUserId as string;

      const result = await query(
        `
        WITH activity_stats AS (
          SELECT user_id, COUNT(*)::int AS activities_count,
            COALESCE(SUM(distance_km), 0)::double precision AS total_distance_km
          FROM activities GROUP BY user_id
        ),
        territory_stats AS (
          SELECT user_id, COUNT(*)::int AS territories_captured,
            COALESCE(SUM(area_km2), 0)::double precision AS territory_km2
          FROM territories GROUP BY user_id
        )
        SELECT
          ROW_NUMBER() OVER (
            ORDER BY COALESCE(t.territory_km2, 0) DESC,
              COALESCE(a.total_distance_km, 0) DESC, u.created_at ASC
          )::int AS rank,
          u.id, u.username, u.display_name, u.avatar_url,
          COALESCE(t.territory_km2, 0)::double precision AS territory_km2,
          COALESCE(t.territories_captured, 0)::int AS territories_captured,
          COALESCE(a.activities_count, 0)::int AS activities_count,
          COALESCE(a.total_distance_km, 0)::double precision AS total_distance_km
        FROM users u
        LEFT JOIN activity_stats a ON a.user_id = u.id
        LEFT JOIN territory_stats t ON t.user_id = u.id
        WHERE
          ($1::text = 'Global'
            OR ($1::text = 'City' AND NULLIF(TRIM((SELECT city FROM users WHERE id = $2::uuid)), '') IS NOT NULL
                AND LOWER(TRIM(u.city)) = LOWER(TRIM((SELECT city FROM users WHERE id = $2::uuid))))
            OR ($1::text = 'Friends' AND (
                u.id = $2::uuid OR EXISTS (
                  SELECT 1 FROM follows f
                  WHERE f.follower_id = $2::uuid AND f.following_id = u.id
                )
            )))
        ORDER BY rank ASC
        `,
        [scope, userId],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  },
);

router.get(
  '/api/competitions',
  async (req, res) => {
    try {
      const rawLatitude = req.query.latitude;
      const rawLongitude = req.query.longitude;
      const rawRadius = req.query.radiusKm;
      const hasLocation =
        rawLatitude !== undefined || rawLongitude !== undefined;

      let latitude: number | null = null;
      let longitude: number | null = null;

      if (hasLocation) {
        if (
          typeof rawLatitude !== 'string' ||
          typeof rawLongitude !== 'string' ||
          rawLatitude.trim() === '' ||
          rawLongitude.trim() === ''
        ) {
          return res.status(400).json({
            error: 'latitude and longitude must be provided together',
          });
        }

        latitude = Number(rawLatitude);
        longitude = Number(rawLongitude);

        if (
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90 ||
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          return res.status(400).json({
            error: 'Invalid latitude or longitude',
          });
        }
      }

      const radiusKm =
        rawRadius === undefined ? 25 : Number(rawRadius);

      if (
        !Number.isFinite(radiusKm) ||
        radiusKm < 1 ||
        radiusKm > 500
      ) {
        return res.status(400).json({
          error: 'radiusKm must be between 1 and 500',
        });
      }

      const result = await query(
        `
        SELECT
          c.id,
          c.name,
          c.description,
          c.creator_id,
          c.metric,
          c.start_at,
          c.end_at,
          c.is_public,
          c.created_at,
          c.latitude,
          c.longitude,
          nearby.distance_km,

          u.username AS creator_username,
          u.display_name AS creator_display_name,

          COUNT(cp.user_id)::int
            AS participants_count,

          CASE
            WHEN NOW() < c.start_at
              THEN 'UPCOMING'
            WHEN NOW() > c.end_at
              THEN 'ENDED'
            ELSE 'ACTIVE'
          END AS status

        FROM competitions c

        JOIN users u
          ON u.id = c.creator_id

        LEFT JOIN competition_participants cp
          ON cp.competition_id = c.id

        CROSS JOIN LATERAL (
          SELECT CASE
            WHEN $1::double precision IS NULL THEN NULL
            WHEN c.latitude IS NULL OR c.longitude IS NULL THEN NULL
            ELSE 6371 * 2 * ASIN(SQRT(LEAST(1.0,
              POWER(SIN(RADIANS(c.latitude - $1::double precision) / 2), 2)
              + COS(RADIANS($1::double precision))
              * COS(RADIANS(c.latitude))
              * POWER(SIN(RADIANS(c.longitude - $2::double precision) / 2), 2)
            )))
          END AS distance_km
        ) nearby

        WHERE c.is_public = TRUE
          AND (
            $1::double precision IS NULL
            OR (
              c.latitude IS NOT NULL
              AND c.longitude IS NOT NULL
              AND nearby.distance_km <= $3::double precision
            )
          )

        GROUP BY
          c.id,
          u.username,
          u.display_name

        ORDER BY
          CASE
            WHEN NOW() BETWEEN c.start_at
              AND c.end_at THEN 0
            WHEN NOW() < c.start_at THEN 1
            ELSE 2
          END,
          CASE
            WHEN $1::double precision IS NOT NULL
              THEN nearby.distance_km
            ELSE NULL
          END ASC NULLS LAST,
          c.start_at ASC
        `,
        [latitude, longitude, radiusKm],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch competitions',
      });
    }
  },
);

router.get(
  '/api/users/:userId/competitions',
  async (req, res) => {
    try {
      const { userId } = req.params;

      const result = await query(
        `
        SELECT
          c.id,
          c.name,
          c.description,
          c.metric,
          c.start_at,
          c.end_at,
          c.created_at,

          COUNT(all_cp.user_id)::int
            AS participants_count,

          CASE
            WHEN NOW() < c.start_at
              THEN 'UPCOMING'
            WHEN NOW() > c.end_at
              THEN 'ENDED'
            ELSE 'ACTIVE'
          END AS status

        FROM competition_participants mine

        JOIN competitions c
          ON c.id = mine.competition_id

        LEFT JOIN competition_participants all_cp
          ON all_cp.competition_id = c.id

        WHERE mine.user_id = $1

        GROUP BY c.id

        ORDER BY
          mine.joined_at DESC
        `,
        [userId],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch user competitions',
      });
    }
  },
);

router.post(
  '/api/competitions',
  requireAuth, async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const { name, description, metric, durationDays, latitude, longitude } = req.body;

      const cleanName =
        typeof name === 'string'
          ? name.trim()
          : '';

      const cleanDescription =
        typeof description === 'string'
          ? description.trim()
          : '';

      const hasLatitude = latitude !== undefined && latitude !== null;
      const hasLongitude = longitude !== undefined && longitude !== null;

      if (hasLatitude !== hasLongitude) {
        return res.status(400).json({
          error: 'latitude and longitude must be provided together',
        });
      }

      const cleanLatitude = hasLatitude ? Number(latitude) : null;
      const cleanLongitude = hasLongitude ? Number(longitude) : null;

      if (
        hasLatitude &&
        (
          !Number.isFinite(cleanLatitude) ||
          cleanLatitude! < -90 ||
          cleanLatitude! > 90 ||
          !Number.isFinite(cleanLongitude) ||
          cleanLongitude! < -180 ||
          cleanLongitude! > 180
        )
      ) {
        return res.status(400).json({
          error: 'Invalid latitude or longitude',
        });
      }

      if (!cleanName) {
        return res.status(400).json({
          error:
            'name is required',
        });
      }

      if (
        ![
          'DISTANCE',
          'TERRITORY',
          'ACTIVITIES',
        ].includes(metric)
      ) {
        return res.status(400).json({
          error:
            'Invalid competition metric',
        });
      }

      const days =
        Number(durationDays);

      if (
        !Number.isFinite(days) ||
        days < 1 ||
        days > 90
      ) {
        return res.status(400).json({
          error:
            'durationDays must be between 1 and 90',
        });
      }

      if (cleanName.length > 120) {
        return res.status(400).json({
          error:
            'Competition name cannot exceed 120 characters',
        });
      }

      if (cleanDescription.length > 500) {
        return res.status(400).json({
          error:
            'Competition description cannot exceed 500 characters',
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

      const result = await query(
        `
        INSERT INTO competitions (
          name,
          description,
          creator_id,
          metric,
          start_at,
          end_at,
          latitude,
          longitude
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          NOW(),
          NOW() + ($5 * INTERVAL '1 day'),
          $6,
          $7
        )
        RETURNING
          id,
          name,
          description,
          creator_id,
          metric,
          start_at,
          end_at,
          is_public,
          created_at,
          latitude,
          longitude
        `,
        [
          cleanName,
          cleanDescription,
          userId,
          metric,
          days,
          cleanLatitude,
          cleanLongitude,
        ],
      );

      const competition =
        result.rows[0];

      await query(
        `
        INSERT INTO competition_participants (
          competition_id,
          user_id
        )
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [
          competition.id,
          userId,
        ],
      );

      res.status(201).json({
        ...competition,
        participants_count: 1,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to create competition',
      });
    }
  },
);

router.get(
  '/api/competitions/:competitionId',
  async (req, res) => {
    try {
      const {
        competitionId,
      } = req.params;

      const result = await query(
        `
        SELECT
          c.id,
          c.name,
          c.description,
          c.creator_id,
          c.metric,
          c.start_at,
          c.end_at,
          c.is_public,
          c.created_at,

          u.username AS creator_username,
          u.display_name AS creator_display_name,

          COUNT(cp.user_id)::int
            AS participants_count,

          CASE
            WHEN NOW() < c.start_at
              THEN 'UPCOMING'
            WHEN NOW() > c.end_at
              THEN 'ENDED'
            ELSE 'ACTIVE'
          END AS status

        FROM competitions c

        JOIN users u
          ON u.id = c.creator_id

        LEFT JOIN competition_participants cp
          ON cp.competition_id = c.id

        WHERE c.id = $1

        GROUP BY
          c.id,
          u.username,
          u.display_name
        `,
        [competitionId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error:
            'Competition not found',
        });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch competition',
      });
    }
  },
);

router.get(
  '/api/competitions/:competitionId/leaderboard',
  async (req, res) => {
    try {
      const {
        competitionId,
      } = req.params;

      const competitionResult =
        await query(
          `
          SELECT
            id,
            metric,
            start_at,
            end_at
          FROM competitions
          WHERE id = $1
          `,
          [competitionId],
        );

      if (
        competitionResult.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Competition not found',
        });
      }

      const competition =
        competitionResult.rows[0];

      const result = await query(
        `
        WITH participant_activity_stats AS (
          SELECT
            cp.user_id,

            COALESCE(
              SUM(a.distance_km),
              0
            )::double precision
              AS distance_score,

            COUNT(a.id)::int
              AS activity_count

          FROM competition_participants cp

          LEFT JOIN activities a
            ON a.user_id = cp.user_id
            AND a.created_at >= $2
            AND a.created_at <= $3

          WHERE cp.competition_id = $1

          GROUP BY cp.user_id
        ),

        participant_territory_stats AS (
          SELECT
            cp.user_id,

            COALESCE(
              SUM(t.area_km2),
              0
            )::double precision
              AS territory_score

          FROM competition_participants cp

          LEFT JOIN territories t
            ON t.user_id = cp.user_id
            AND t.captured_at >= $2
            AND t.captured_at <= $3

          WHERE cp.competition_id = $1

          GROUP BY cp.user_id
        ),

        participant_scores AS (
          SELECT
            cp.user_id,

            u.username,

            u.display_name,

            u.avatar_url,

            CASE
              WHEN $4 = 'DISTANCE' THEN
                COALESCE(
                  pas.distance_score,
                  0
                )

              WHEN $4 = 'TERRITORY' THEN
                COALESCE(
                  pts.territory_score,
                  0
                )

              WHEN $4 = 'ACTIVITIES' THEN
                COALESCE(
                  pas.activity_count,
                  0
                )::double precision

              ELSE 0
            END AS score

          FROM competition_participants cp

          JOIN users u
            ON u.id = cp.user_id

          LEFT JOIN participant_activity_stats pas
            ON pas.user_id = cp.user_id

          LEFT JOIN participant_territory_stats pts
            ON pts.user_id = cp.user_id

          WHERE cp.competition_id = $1
        )

        SELECT
          ROW_NUMBER() OVER (
            ORDER BY score DESC, display_name ASC
          )::int AS rank,

          *
        FROM participant_scores

        ORDER BY rank ASC
        `,
        [
          competitionId,
          competition.start_at,
          competition.end_at,
          competition.metric,
        ],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch competition leaderboard',
      });
    }
  },
);

router.post(
  '/api/competitions/:competitionId/join/:userId',
  requireAuth, async (req, res) => {
    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      const competitionResult =
        await query(
          `
          SELECT
            id,
            is_public,
            start_at,
            end_at
          FROM competitions
          WHERE id = $1
          `,
          [competitionId],
        );

      if (
        competitionResult.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Competition not found',
        });
      }

      const competition =
        competitionResult.rows[0];

      if (!competition.is_public) {
        return res.status(403).json({
          error:
            'This competition is private',
        });
      }

      if (
        new Date(competition.end_at) <
        new Date()
      ) {
        return res.status(400).json({
          error:
            'Competition has already ended',
        });
      }

      const result = await query(
        `
        INSERT INTO competition_participants (
          competition_id,
          user_id
        )
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        RETURNING
          competition_id,
          user_id,
          joined_at
        `,
        [
          competitionId,
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
        error:
          'Failed to join competition',
      });
    }
  },
);

router.delete(
  '/api/competitions/:competitionId/join/:userId',
  requireAuth, async (req, res) => {
    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      const result = await query(
        `
        DELETE FROM competition_participants
        WHERE competition_id = $1
          AND user_id = $2
        `,
        [
          competitionId,
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
        error:
          'Failed to leave competition',
      });
    }
  },
);

router.get(
  '/api/competitions/:competitionId/membership/:userId',
  async (req, res) => {
    try {
      const {
        competitionId,
        userId,
      } = req.params;

      const result = await query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM competition_participants
          WHERE competition_id = $1
            AND user_id = $2
        ) AS joined
        `,
        [
          competitionId,
          userId,
        ],
      );

      res.json({
        joined:
          result.rows[0]?.joined ?? false,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch competition membership',
      });
    }
  },
);

  app.use(router);
}

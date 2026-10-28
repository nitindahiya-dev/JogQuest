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
  const { pool, query, requireAuth } = context;

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
            WHEN c.status IN ('CANCELLED', 'COMPLETED', 'DRAFT')
              THEN c.status
            WHEN NOW() < COALESCE(c.registration_opens_at, c.created_at)
              THEN 'DRAFT'
            WHEN NOW() < c.start_at
              AND NOW() < COALESCE(c.registration_closes_at, c.start_at)
              THEN 'REGISTRATION_OPEN'
            WHEN NOW() < c.start_at
              THEN 'UPCOMING'
            WHEN NOW() < c.end_at
              THEN 'ACTIVE'
            ELSE 'UNDER_REVIEW'
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
          AND c.status NOT IN ('DRAFT', 'CANCELLED')
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
          u.display_name,
          nearby.distance_km

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
            WHEN c.status IN ('CANCELLED', 'COMPLETED', 'DRAFT')
              THEN c.status
            WHEN NOW() < COALESCE(c.registration_opens_at, c.created_at)
              THEN 'DRAFT'
            WHEN NOW() < c.start_at
              AND NOW() < COALESCE(c.registration_closes_at, c.start_at)
              THEN 'REGISTRATION_OPEN'
            WHEN NOW() < c.start_at
              THEN 'UPCOMING'
            WHEN NOW() < c.end_at
              THEN 'ACTIVE'
            ELSE 'UNDER_REVIEW'
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
          status,
          registration_opens_at,
          registration_closes_at,
          latitude,
          longitude
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          NOW() + INTERVAL '1 day',
          NOW() + ((1 + $5) * INTERVAL '1 day'),
          'DRAFT',
          NULL,
          NULL,
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
          status,
          registration_opens_at,
          registration_closes_at,
          max_participants,
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


// PHASE7_DRAFT_EDIT_PUBLISH
router.put(
  '/api/competitions/:competitionId/draft',
  requireAuth,
  async (req, res) => {
    const client = await pool.connect();
    let inTransaction = false;

    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;
      const body = req.body as {
        name?: unknown;
        description?: unknown;
        metric?: unknown;
        durationDays?: unknown;
      };

      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const description =
        typeof body.description === 'string' ? body.description.trim() : '';
      const metric = body.metric;
      const days = Number(body.durationDays);

      if (!name || name.length > 120) {
        return res.status(400).json({
          error: 'Name is required and must not exceed 120 characters',
        });
      }
      if (description.length > 500) {
        return res.status(400).json({
          error: 'Description must not exceed 500 characters',
        });
      }
      if (!['DISTANCE', 'TERRITORY', 'ACTIVITIES'].includes(String(metric))) {
        return res.status(400).json({ error: 'Invalid competition metric' });
      }
      if (!Number.isInteger(days) || days < 1 || days > 90) {
        return res.status(400).json({
          error: 'durationDays must be an integer between 1 and 90',
        });
      }

      await client.query('BEGIN');
      inTransaction = true;

      const current = await client.query(
        `SELECT id, creator_id, name, description, metric, status, start_at, end_at
         FROM competitions
         WHERE id = $1
         FOR UPDATE`,
        [competitionId],
      );

      if (!current.rows.length || current.rows[0].creator_id !== userId) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({
          error: 'Draft not found or you are not its creator',
        });
      }

      const before = current.rows[0];
      if (before.status !== 'DRAFT') {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({
          error: 'Only DRAFT competitions can be edited',
        });
      }

      const updated = await client.query(
        `UPDATE competitions
         SET name = $2,
             description = $3,
             metric = $4,
             start_at = NOW() + INTERVAL '1 day',
             end_at = NOW() + (($5::int + 1) * INTERVAL '1 day')
         WHERE id = $1
         RETURNING id, name, description, creator_id, metric, start_at, end_at,
                   status, registration_opens_at, registration_closes_at,
                   max_participants, is_public, created_at, latitude, longitude`,
        [competitionId, name, description, metric, days],
      );

      await client.query(
        `INSERT INTO competition_admin_audit
          (competition_id, actor_user_id, action_type, reason, before_data, after_data)
         VALUES ($1, $2, 'DRAFT_UPDATED', $3, $4::jsonb, $5::jsonb)`,
        [
          competitionId,
          userId,
          'Organizer edited competition draft',
          JSON.stringify({
            name: before.name,
            description: before.description,
            metric: before.metric,
            start_at: before.start_at,
            end_at: before.end_at,
          }),
          JSON.stringify({
            name,
            description,
            metric,
            start_at: updated.rows[0].start_at,
            end_at: updated.rows[0].end_at,
          }),
        ],
      );

      await client.query('COMMIT');
      inTransaction = false;
      return res.json({ updated: true, competition: updated.rows[0] });
    } catch (error) {
      if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
      console.error(error);
      return res.status(500).json({ error: 'Failed to update draft' });
    } finally {
      client.release();
    }
  },
);

router.post(
  '/api/competitions/:competitionId/publish',
  requireAuth,
  async (req, res) => {
    const client = await pool.connect();
    let inTransaction = false;

    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      await client.query('BEGIN');
      inTransaction = true;

      const current = await client.query(
        `SELECT id, creator_id, status, start_at, end_at
         FROM competitions
         WHERE id = $1
         FOR UPDATE`,
        [competitionId],
      );

      if (!current.rows.length || current.rows[0].creator_id !== userId) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({
          error: 'Draft not found or you are not its creator',
        });
      }

      const draft = current.rows[0];
      if (draft.status !== 'DRAFT') {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({
          error: 'Only DRAFT competitions can be published',
          status: draft.status,
        });
      }

      if (
        !Number.isFinite(new Date(draft.start_at).getTime()) ||
        !Number.isFinite(new Date(draft.end_at).getTime()) ||
        new Date(draft.end_at).getTime() <= new Date(draft.start_at).getTime()
      ) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({
          error: 'Competition dates are invalid',
        });
      }

      const published = await client.query(
        `UPDATE competitions
         SET status = 'REGISTRATION_OPEN',
             registration_opens_at = NOW(),
             registration_closes_at = start_at
         WHERE id = $1
         RETURNING id, name, description, creator_id, metric, start_at, end_at,
                   status, registration_opens_at, registration_closes_at,
                   max_participants, is_public, created_at, latitude, longitude`,
        [competitionId],
      );

      await client.query(
        `INSERT INTO competition_admin_audit
          (competition_id, actor_user_id, action_type, reason, before_data, after_data)
         VALUES ($1, $2, 'DRAFT_PUBLISHED', $3, $4::jsonb, $5::jsonb)`,
        [
          competitionId,
          userId,
          'Organizer published competition draft',
          JSON.stringify({ status: 'DRAFT' }),
          JSON.stringify({ status: 'REGISTRATION_OPEN' }),
        ],
      );

      await client.query('COMMIT');
      inTransaction = false;
      return res.json({ published: true, competition: published.rows[0] });
    } catch (error) {
      if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
      console.error(error);
      return res.status(500).json({ error: 'Failed to publish competition' });
    } finally {
      client.release();
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
          c.registration_opens_at,
          c.registration_closes_at,
          c.max_participants,
          c.is_public,
          c.created_at,

          u.username AS creator_username,
          u.display_name AS creator_display_name,

          COUNT(cp.user_id)::int
            AS participants_count,

          CASE
            WHEN c.status IN ('CANCELLED', 'COMPLETED', 'DRAFT')
              THEN c.status
            WHEN NOW() < COALESCE(c.registration_opens_at, c.created_at)
              THEN 'DRAFT'
            WHEN NOW() < c.start_at
              AND NOW() < COALESCE(c.registration_closes_at, c.start_at)
              THEN 'REGISTRATION_OPEN'
            WHEN NOW() < c.start_at
              THEN 'UPCOMING'
            WHEN NOW() < c.end_at
              THEN 'ACTIVE'
            ELSE 'UNDER_REVIEW'
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
  '/api/competitions/:competitionId/progress',
  requireAuth,
  async (req, res) => {
    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      const competitionResult = await query(
        `
        SELECT id, metric
        FROM competitions
        WHERE id = $1
        `,
        [competitionId],
      );

      if (competitionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Competition not found' });
      }

      const membershipResult = await query(
        `
        SELECT 1
        FROM competition_participants
        WHERE competition_id = $1 AND user_id = $2
        `,
        [competitionId, userId],
      );

      if (membershipResult.rows.length === 0) {
        return res.status(403).json({
          error: 'Join the challenge to view your participant progress',
        });
      }

      const result = await query(
        `
        WITH participant_totals AS (
          SELECT
            cp.user_id,
            u.display_name,
            COALESCE(
              SUM(cas.score) FILTER (
                WHERE cas.scoring_status = 'SCORED'
              ),
              0
            )::numeric AS total_score,
            COUNT(*) FILTER (
              WHERE cas.scoring_status = 'REVIEW'
            )::int AS review_count
          FROM competition_participants cp
          JOIN users u ON u.id = cp.user_id
          LEFT JOIN competition_activity_scores cas
            ON cas.competition_id = cp.competition_id
           AND cas.user_id = cp.user_id
          WHERE cp.competition_id = $1
          GROUP BY cp.user_id, u.display_name
        ),
        ranked AS (
          SELECT
            user_id,
            total_score,
            review_count,
            ROW_NUMBER() OVER (
              ORDER BY total_score DESC, display_name ASC, user_id ASC, user_id ASC
            )::int AS rank,
            COUNT(*) OVER ()::int AS participant_count
          FROM participant_totals
        ),
        breakdown AS (
          SELECT
            metric,
            COALESCE(SUM(score) FILTER (
              WHERE scoring_status = 'SCORED'
            ), 0)::numeric AS score,
            COUNT(*) FILTER (
              WHERE scoring_status = 'REVIEW'
            )::int AS review_count,
            COUNT(*) FILTER (
              WHERE scoring_status = 'SCORED'
            )::int AS scored_activities
          FROM competition_activity_scores
          WHERE competition_id = $1 AND user_id = $2
          GROUP BY metric
        )
        SELECT
          r.rank,
          r.total_score,
          r.review_count,
          r.participant_count,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'metric', b.metric,
                  'score', b.score,
                  'reviewCount', b.review_count,
                  'scoredActivities', b.scored_activities
                )
                ORDER BY b.metric
              )
              FROM breakdown b
            ),
            '[]'::jsonb
          ) AS breakdown
        FROM ranked r
        WHERE r.user_id = $2
        `,
        [competitionId, userId],
      );

      return res.json({
        competitionId,
        metric: competitionResult.rows[0].metric,
        ...(result.rows[0] ?? {
          rank: null,
          total_score: 0,
          review_count: 0,
          participant_count: 0,
          breakdown: [],
        }),
        rankingRule: 'score_desc_display_name_asc_user_id_asc',
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Failed to fetch participant progress',
      });
    }
  },
);

router.get(
  '/api/competitions/:competitionId/review-flags',
  requireAuth,
  async (req, res) => {
    try {
      const competitionId = String(req.params.competitionId);
      const userId = res.locals.authenticatedUserId as string;

      const result = await query(
        `
        SELECT
          f.id,
          f.activity_id,
          f.user_id,
          u.username,
          u.display_name,
          f.reason,
          f.details,
          f.created_at
        FROM competition_activity_flags f
        JOIN competitions c
          ON c.id = f.competition_id
        LEFT JOIN users u
          ON u.id = f.user_id
        WHERE f.competition_id = $1
          AND c.creator_id = $2
          AND f.resolved_at IS NULL
        ORDER BY f.created_at DESC
        `,
        [competitionId, userId],
      );

      // Return an empty list when the caller owns the challenge
      // but there are no pending flags. Non-owners receive no data.
      const ownership = await query(
        `
        SELECT 1
        FROM competitions
        WHERE id = $1 AND creator_id = $2
        `,
        [competitionId, userId],
      );

      if (ownership.rows.length === 0) {
        return res.status(404).json({
          error: 'Challenge not found',
        });
      }

      return res.json(result.rows);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Failed to fetch challenge review flags',
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
        SELECT
          ROW_NUMBER() OVER (
            ORDER BY COALESCE(scores.total_score, 0) DESC,
                     u.display_name ASC,
                     u.id ASC
          )::int AS rank,
          cp.user_id,
          u.username,
          u.display_name,
          u.avatar_url,
          COALESCE(scores.total_score, 0)::double precision AS score,
          COALESCE(scores.review_count, 0)::int AS review_count
        FROM competition_participants cp
        JOIN users u ON u.id = cp.user_id
        LEFT JOIN LATERAL (
          SELECT
            SUM(s.score) FILTER (
              WHERE s.scoring_status = 'SCORED'
            ) AS total_score,
            COUNT(*) FILTER (
              WHERE s.scoring_status = 'REVIEW'
            ) AS review_count
          FROM competition_activity_scores s
          WHERE s.competition_id = cp.competition_id
            AND s.user_id = cp.user_id
            AND s.metric = $2
        ) scores ON TRUE
        WHERE cp.competition_id = $1
        ORDER BY rank ASC
        `,
        [competitionId, competition.metric],
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
  requireAuth,
  async (req, res) => {
    const client = await pool.connect();
    let inTransaction = false;

    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      await client.query('BEGIN');
      inTransaction = true;

      // Serialize joins for this challenge so simultaneous requests
      // cannot exceed max_participants.
      const competitionResult = await client.query(
        `
        SELECT
          id,
          is_public,
          status,
          start_at,
          end_at,
          registration_opens_at,
          registration_closes_at,
          max_participants
        FROM competitions
        WHERE id = $1
        FOR UPDATE
        `,
        [competitionId],
      );

      if (competitionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({ error: 'Competition not found' });
      }

      const competition = competitionResult.rows[0];

      if (!competition.is_public) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(403).json({ error: 'This competition is private' });
      }
      if (competition.status !== 'REGISTRATION_OPEN') {
        return res.status(409).json({
          error: 'Competition is not open for registration',
          status: competition.status,
        });
      }

      const registrationOpensAt = competition.registration_opens_at
        ? new Date(competition.registration_opens_at).getTime()
        : Number.NEGATIVE_INFINITY;
      const registrationClosesAt = competition.registration_closes_at
        ? new Date(competition.registration_closes_at).getTime()
        : new Date(competition.start_at).getTime();

      if (
        Date.now() < registrationOpensAt ||
        Date.now() >= registrationClosesAt
      ) {
        return res.status(409).json({
          error: 'Competition registration is not currently open',
        });
      }


      // Retry-safe: an existing participant remains joined and does not
      // consume another slot or create another audit event.
      const existing = await client.query(
        `
        SELECT joined_at
        FROM competition_participants
        WHERE competition_id = $1 AND user_id = $2
        `,
        [competitionId, userId],
      );

      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        inTransaction = false;
        return res.json({
          joined: true,
          created: false,
          alreadyJoined: true,
          joined_at: existing.rows[0].joined_at,
        });
      }

      const now = Date.now();
      const startAt = new Date(competition.start_at).getTime();
      const endAt = new Date(competition.end_at).getTime();
      const opensAt = competition.registration_opens_at
        ? new Date(competition.registration_opens_at).getTime()
        : Number.NEGATIVE_INFINITY;
      const closesAt = competition.registration_closes_at
        ? new Date(competition.registration_closes_at).getTime()
        : startAt;

      if (competition.status === 'CANCELLED') {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ error: 'This competition has been cancelled' });
      }

      if (competition.status === 'COMPLETED' || now >= endAt) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ error: 'Competition has already ended' });
      }

      if (now < opensAt) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ error: 'Registration has not opened yet' });
      }

      if (now >= closesAt || now >= startAt) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({ error: 'Registration is closed' });
      }

      if (
        competition.max_participants !== null &&
        competition.max_participants !== undefined
      ) {
        const countResult = await client.query(
          `
          SELECT COUNT(*)::int AS participants_count
          FROM competition_participants
          WHERE competition_id = $1
          `,
          [competitionId],
        );

        if (
          Number(countResult.rows[0]?.participants_count ?? 0) >=
          Number(competition.max_participants)
        ) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'This competition is full' });
        }
      }

      const inserted = await client.query(
        `
        INSERT INTO competition_participants (competition_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (competition_id, user_id) DO NOTHING
        RETURNING competition_id, user_id, joined_at
        `,
        [competitionId, userId],
      );

      if (inserted.rows.length > 0) {
        await client.query(
          `
          INSERT INTO competition_participation_events
            (competition_id, user_id, event_type)
          VALUES ($1, $2, 'JOINED')
          `,
          [competitionId, userId],
        );

        // Score this participant's already-recorded eligible activities.
        // The database function remains the scoring authority.
        await client.query(
          `
          SELECT jq_recalculate_competition_activity(a.id)
          FROM activities a
          JOIN competitions c ON c.id = $1
          WHERE a.user_id = $2
            AND a.started_at >= c.start_at
            AND a.finished_at <= c.end_at
          `,
          [competitionId, userId],
        );

        // Confirm successful participation to the joining user.
        await client.query(
          `
          INSERT INTO notifications (
            user_id, type, title, message, competition_id, dedupe_key
          )
          VALUES (
            $1,
            'COMPETITION_JOIN_CONFIRMATION',
            'Challenge Joined',
            'You joined this challenge successfully. Check its details for the schedule and scoring rules.',
            $2,
            $3
          )
          ON CONFLICT (dedupe_key) DO NOTHING
          `,
          [
            userId,
            competitionId,
            'competition-join-confirmation:' +
              competitionId + ':' + userId + ':' +
              new Date(inserted.rows[0].joined_at).toISOString(),
          ],
        );

      }

      await client.query('COMMIT');
      inTransaction = false;

      return res.status(inserted.rows.length > 0 ? 201 : 200).json({
        joined: true,
        created: inserted.rows.length > 0,
        alreadyJoined: inserted.rows.length === 0,
        participant: inserted.rows[0] ?? null,
      });
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      console.error(error);
      return res.status(500).json({ error: 'Failed to join competition' });
    } finally {
      client.release();
    }
  },
);

router.delete(
  '/api/competitions/:competitionId/join/:userId',
  requireAuth,
  async (req, res) => {
    const client = await pool.connect();
    let inTransaction = false;

    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      await client.query('BEGIN');
      inTransaction = true;

      const competitionResult = await client.query(
        `
        SELECT
          id, status, start_at, end_at,
          registration_opens_at, registration_closes_at
        FROM competitions
        WHERE id = $1
        FOR UPDATE
        `,
        [competitionId],
      );

      if (competitionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({ error: 'Competition not found' });
      }

      const competition = competitionResult.rows[0];

      const existing = await client.query(
        `
        SELECT 1
        FROM competition_participants
        WHERE competition_id = $1 AND user_id = $2
        `,
        [competitionId, userId],
      );

      // Idempotent retry when already withdrawn/not a participant.
      if (existing.rows.length === 0) {
        await client.query('COMMIT');
        inTransaction = false;
        return res.json({ joined: false, removed: false });
      }

      const now = Date.now();
      const startAt = new Date(competition.start_at).getTime();
      const opensAt = competition.registration_opens_at
        ? new Date(competition.registration_opens_at).getTime()
        : Number.NEGATIVE_INFINITY;
      const closesAt = competition.registration_closes_at
        ? new Date(competition.registration_closes_at).getTime()
        : startAt;

      if (
        competition.status === 'CANCELLED' ||
        competition.status === 'COMPLETED' ||
        now >= startAt ||
        now >= closesAt ||
        now < opensAt
      ) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(400).json({
          error: 'You can withdraw only while registration is open and before the challenge starts',
        });
      }

      const removed = await client.query(
        `
        DELETE FROM competition_participants
        WHERE competition_id = $1 AND user_id = $2
        RETURNING competition_id, user_id
        `,
        [competitionId, userId],
      );

      if (removed.rows.length > 0) {
        await client.query(
          `
          INSERT INTO competition_participation_events
            (competition_id, user_id, event_type)
          VALUES ($1, $2, 'WITHDRAWN')
          `,
          [competitionId, userId],
        );
      }

      await client.query('COMMIT');
      inTransaction = false;

      return res.json({
        joined: false,
        removed: removed.rows.length > 0,
      });
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      console.error(error);
      return res.status(500).json({ error: 'Failed to leave competition' });
    } finally {
      client.release();
    }
  },
);

router.get(
  '/api/competitions/:competitionId/membership/:userId',
  requireAuth,
  async (req, res) => {
    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

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


router.post(
  '/api/competitions/:competitionId/review',
  requireAuth,
  async (req, res) => {
    const client = await pool.connect();
    let inTransaction = false;

    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      await client.query('BEGIN');
      inTransaction = true;

      const result = await client.query(
        `SELECT id, creator_id, name, status, start_at, end_at
         FROM competitions
         WHERE id = $1
         FOR UPDATE`,
        [competitionId],
      );

      if (!result.rows.length) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({ error: 'Challenge not found' });
      }

      const challenge = result.rows[0];

      if (challenge.creator_id !== userId) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(403).json({ error: 'Only the challenge creator can start review' });
      }

      if (challenge.status === 'CANCELLED' || challenge.status === 'COMPLETED') {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({ error: 'Cancelled or completed challenges cannot enter review' });
      }

      if (new Date(challenge.end_at).getTime() > Date.now()) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({ error: 'Challenge has not reached its end time' });
      }

      await client.query(
        `SELECT jq_recalculate_competition_activity(a.id)
         FROM activities a
         JOIN competition_participants cp
           ON cp.user_id = a.user_id
          AND cp.competition_id = $1
         WHERE a.started_at >= $2
           AND a.finished_at <= $3`,
        [competitionId, challenge.start_at, challenge.end_at],
      );

      await client.query(
        `UPDATE competitions
         SET status = 'UNDER_REVIEW'
         WHERE id = $1`,
        [competitionId],
      );

      const flags = await client.query(
        `SELECT COUNT(*)::int AS unresolved_count
         FROM competition_activity_flags
         WHERE competition_id = $1
           AND resolved_at IS NULL`,
        [competitionId],
      );

      await client.query('COMMIT');
      inTransaction = false;

      return res.json({
        status: 'UNDER_REVIEW',
        unresolvedFlags: Number(flags.rows[0]?.unresolved_count ?? 0),
        canFinalize: Number(flags.rows[0]?.unresolved_count ?? 0) === 0,
      });
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      console.error(error);
      return res.status(500).json({ error: 'Failed to start challenge review' });
    } finally {
      client.release();
    }
  },
);


router.post(
  '/api/competitions/:competitionId/finalize',
  requireAuth,
  async (req, res) => {
    const client = await pool.connect();
    let inTransaction = false;

    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      await client.query('BEGIN');
      inTransaction = true;

      const result = await client.query(
        `SELECT id, creator_id, metric, status, end_at
         FROM competitions
         WHERE id = $1
         FOR UPDATE`,
        [competitionId],
      );

      if (!result.rows.length) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({ error: 'Challenge not found' });
      }

      const challenge = result.rows[0];

      if (challenge.creator_id !== userId) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(403).json({ error: 'Only the challenge creator can finalize results' });
      }

      if (challenge.status === 'COMPLETED') {
        const existing = await client.query(
          `SELECT rank_position, user_id, score, metric, finalized_at
           FROM competition_results
           WHERE competition_id = $1
           ORDER BY rank_position ASC`,
          [competitionId],
        );
        await client.query('COMMIT');
        inTransaction = false;
        return res.json({
          status: 'COMPLETED',
          alreadyFinalized: true,
          results: existing.rows,
        });
      }

      if (challenge.status !== 'UNDER_REVIEW') {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({ error: 'Challenge must be under review before finalization' });
      }

      if (new Date(challenge.end_at).getTime() > Date.now()) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({ error: 'Challenge has not ended' });
      }

      const unresolved = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM competition_activity_flags
         WHERE competition_id = $1
           AND resolved_at IS NULL`,
        [competitionId],
      );

      if (Number(unresolved.rows[0]?.count ?? 0) > 0) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({
          error: 'Resolve all flagged activities before finalization',
          unresolvedFlags: Number(unresolved.rows[0].count),
        });
      }

      await client.query(
        `WITH participant_totals AS (
           SELECT
             cp.user_id,
             COALESCE(
               SUM(s.score) FILTER (WHERE s.scoring_status = 'SCORED'),
               0
             )::numeric(14,4) AS total_score,
             u.display_name
           FROM competition_participants cp
           JOIN users u ON u.id = cp.user_id
           LEFT JOIN competition_activity_scores s
             ON s.competition_id = cp.competition_id
            AND s.user_id = cp.user_id
            AND s.metric = $2
           WHERE cp.competition_id = $1
           GROUP BY cp.user_id, u.display_name
         ),
         ranked AS (
           SELECT
             user_id,
             total_score,
             ROW_NUMBER() OVER (
               ORDER BY total_score DESC, display_name ASC, user_id ASC
             )::int AS rank_position
           FROM participant_totals
         )
         INSERT INTO competition_results (
           competition_id, user_id, rank_position, score, metric
         )
         SELECT $1, user_id, rank_position, total_score, $2
         FROM ranked`,
        [competitionId, challenge.metric],
      );

      await client.query(
        `UPDATE competitions
         SET status = 'COMPLETED'
         WHERE id = $1`,
        [competitionId],
      );

      const published = await client.query(
        `SELECT rank_position, user_id, score, metric, finalized_at
         FROM competition_results
         WHERE competition_id = $1
         ORDER BY rank_position ASC`,
        [competitionId],
      );

      await client.query('COMMIT');
      inTransaction = false;

      return res.json({
        status: 'COMPLETED',
        alreadyFinalized: false,
        results: published.rows,
      });
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      console.error(error);
      return res.status(500).json({ error: 'Failed to finalize challenge results' });
    } finally {
      client.release();
    }
  },
);

router.get(
  '/api/competitions/:competitionId/results',
  async (req, res) => {
    try {
      const { competitionId } = req.params;
      const result = await query(
        `SELECT
           cr.rank_position,
           cr.user_id,
           u.username,
           u.display_name,
           u.avatar_url,
           cr.score,
           cr.metric,
           cr.finalized_at
         FROM competition_results cr
         JOIN competitions c ON c.id = cr.competition_id
         JOIN users u ON u.id = cr.user_id
         WHERE cr.competition_id = $1
           AND c.status = 'COMPLETED'
         ORDER BY cr.rank_position ASC`,
        [competitionId],
      );

      if (!result.rows.length) {
        const challenge = await query(
          `SELECT id FROM competitions WHERE id = $1`,
          [competitionId],
        );
        if (!challenge.rows.length) {
          return res.status(404).json({ error: 'Challenge not found' });
        }
        return res.status(409).json({ error: 'Official results are not published yet' });
      }

      return res.json({ results: result.rows });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch official results' });
    }
  },
);


router.post(
  '/api/competitions/:competitionId/review-flags/:activityId/resolve',
  requireAuth,
  async (req, res) => {
    const client = await pool.connect();
    let inTransaction = false;

    try {
      const { competitionId, activityId } = req.params;
      const actorUserId = res.locals.authenticatedUserId as string;
      const body = req.body as {
        decision?: string;
        resolutionNote?: string;
      };

      const decision = body.decision;
      const note =
        typeof body.resolutionNote === 'string'
          ? body.resolutionNote.trim()
          : '';

      if (decision !== 'APPROVED' && decision !== 'REJECTED') {
        return res.status(400).json({
          error: "decision must be 'APPROVED' or 'REJECTED'",
        });
      }

      if (!note || note.length > 1000) {
        return res.status(400).json({
          error: 'A resolution note of 1–1000 characters is required',
        });
      }

      await client.query('BEGIN');
      inTransaction = true;

      const owner = await client.query(
        `SELECT id, status, metric
         FROM competitions
         WHERE id = $1 AND creator_id = $2
         FOR UPDATE`,
        [competitionId, actorUserId],
      );

      if (!owner.rows.length) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({
          error: 'Challenge not found or you are not its creator',
        });
      }

      if (owner.rows[0].status !== 'UNDER_REVIEW') {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({
          error: 'Activity decisions are only allowed during challenge review',
        });
      }

      const flagResult = await client.query(
        `SELECT id, user_id, reason, details
         FROM competition_activity_flags
         WHERE competition_id = $1
           AND activity_id = $2
           AND resolved_at IS NULL
         FOR UPDATE`,
        [competitionId, activityId],
      );

      if (!flagResult.rows.length) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({
          error: 'Unresolved activity flag not found',
        });
      }

      const activityResult = await client.query(
        `SELECT
           a.id,
           a.user_id,
           a.started_at,
           a.finished_at,
           a.distance_km,
           a.elapsed_seconds,
           c.metric,
           CASE
             WHEN c.metric = 'DISTANCE'
               THEN a.distance_km::numeric
             WHEN c.metric = 'ACTIVITIES'
               THEN 1::numeric
             WHEN c.metric = 'TERRITORY'
               THEN COALESCE((
                 SELECT SUM(t.area_km2)::numeric
                 FROM territories t
                 WHERE t.activity_id = a.id
                   AND t.user_id = a.user_id
               ), 0)
             ELSE 0
           END AS trusted_score
         FROM activities a
         JOIN competitions c ON c.id = $1
         JOIN competition_participants cp
           ON cp.competition_id = c.id
          AND cp.user_id = a.user_id
         WHERE a.id = $2
           AND a.user_id = $3
           AND a.started_at IS NOT NULL
           AND a.finished_at IS NOT NULL
           AND a.finished_at > a.started_at
           AND a.distance_km > 0
           AND a.elapsed_seconds > 0
           AND a.started_at >= c.start_at
           AND a.finished_at <= c.end_at
           AND c.metric IN ('DISTANCE', 'ACTIVITIES', 'TERRITORY')
         FOR UPDATE OF a`,
        [
          competitionId,
          activityId,
          flagResult.rows[0].user_id,
        ],
      );

      if (!activityResult.rows.length) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({
          error: 'Flagged activity is no longer eligible for scoring',
        });
      }

      const activity = activityResult.rows[0];
      const score =
        decision === 'APPROVED'
          ? Number(activity.trusted_score)
          : 0;

      if (!Number.isFinite(score) || score < 0) {
        throw new Error('Calculated activity score is invalid');
      }

      const previousOverride = await client.query(
        `SELECT corrected_score, review_decision, reason
         FROM competition_activity_score_overrides
         WHERE competition_id = $1 AND activity_id = $2
         FOR UPDATE`,
        [competitionId, activityId],
      );

      await client.query(
        `INSERT INTO competition_activity_score_overrides (
           competition_id,
           activity_id,
           user_id,
           corrected_score,
           actor_user_id,
           reason,
           review_decision,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (competition_id, activity_id)
         DO UPDATE SET
           user_id = EXCLUDED.user_id,
           corrected_score = EXCLUDED.corrected_score,
           actor_user_id = EXCLUDED.actor_user_id,
           reason = EXCLUDED.reason,
           review_decision = EXCLUDED.review_decision,
           updated_at = NOW()`,
        [
          competitionId,
          activityId,
          activity.user_id,
          score,
          actorUserId,
          note,
          decision,
        ],
      );

      const resolvedFlag = await client.query(
        `UPDATE competition_activity_flags
         SET resolved_at = NOW(),
             resolved_by = $3,
             resolution_note = $4
         WHERE competition_id = $1
           AND activity_id = $2
           AND resolved_at IS NULL
         RETURNING id, activity_id, user_id, reason,
                   resolved_at, resolved_by, resolution_note`,
        [competitionId, activityId, actorUserId, note],
      );

      if (!resolvedFlag.rows.length) {
        throw new Error('Flag was not resolved; transaction will roll back');
      }

      await client.query(
        `INSERT INTO competition_admin_audit (
           competition_id,
           actor_user_id,
           action_type,
           target_user_id,
           activity_id,
           reason,
           before_data,
           after_data
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          competitionId,
          actorUserId,
          decision === 'APPROVED'
            ? 'ACTIVITY_FLAG_APPROVED'
            : 'ACTIVITY_FLAG_REJECTED',
          activity.user_id,
          activityId,
          note,
          JSON.stringify({
            correctedScore: previousOverride.rows[0]?.corrected_score ?? null,
            reviewDecision: previousOverride.rows[0]?.review_decision ?? null,
            reason: previousOverride.rows[0]?.reason ?? null,
          }),
          JSON.stringify({
            correctedScore: score,
            reviewDecision: decision,
            flagReason: flagResult.rows[0].reason,
          }),
        ],
      );

      await client.query(
        'SELECT jq_recalculate_competition_activity($1)',
        [activityId],
      );

      const finalScore = await client.query(
        `SELECT score, scoring_status, provenance
         FROM competition_activity_scores
         WHERE competition_id = $1 AND activity_id = $2`,
        [competitionId, activityId],
      );

      const remaining = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM competition_activity_flags
         WHERE competition_id = $1 AND resolved_at IS NULL`,
        [competitionId],
      );

      await client.query('COMMIT');
      inTransaction = false;

      return res.json({
        resolved: true,
        decision,
        flag: resolvedFlag.rows[0],
        score: finalScore.rows[0] ?? null,
        unresolvedFlags: Number(remaining.rows[0]?.count ?? 0),
        canFinalize: Number(remaining.rows[0]?.count ?? 0) === 0,
      });
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      console.error(error);
      return res.status(500).json({
        error: 'Failed to record activity review decision',
      });
    } finally {
      client.release();
    }
  },
);
// Phase 7: organizer-only participant and evidence views.
router.get(
  '/api/competitions/:competitionId/admin/participants',
  requireAuth,
  async (req, res) => {
    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '50'), 10) || 50));
      const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? '0'), 10) || 0);

      const owner = await query(
        'SELECT id FROM competitions WHERE id = $1 AND creator_id = $2',
        [competitionId, userId],
      );
      if (!owner.rows.length) {
        return res.status(404).json({ error: 'Challenge not found or you are not its creator' });
      }

      const result = await query(
        `WITH score_totals AS (
           SELECT user_id,
             COALESCE(SUM(score) FILTER (WHERE scoring_status = 'SCORED'), 0)::numeric AS total_score,
             COUNT(*) FILTER (WHERE scoring_status = 'REVIEW')::int AS review_score_count
           FROM competition_activity_scores
           WHERE competition_id = $1
           GROUP BY user_id
         ),
         flag_totals AS (
           SELECT user_id,
             COUNT(*) FILTER (WHERE resolved_at IS NULL)::int AS unresolved_flags
           FROM competition_activity_flags
           WHERE competition_id = $1
           GROUP BY user_id
         )
         SELECT cp.user_id, u.username, u.display_name, u.avatar_url, cp.joined_at,
           COALESCE(st.total_score, 0)::numeric AS total_score,
           COALESCE(st.review_score_count, 0)::int AS review_score_count,
           COALESCE(ft.unresolved_flags, 0)::int AS unresolved_flags
         FROM competition_participants cp
         JOIN users u ON u.id = cp.user_id
         LEFT JOIN score_totals st ON st.user_id = cp.user_id
         LEFT JOIN flag_totals ft ON ft.user_id = cp.user_id
         WHERE cp.competition_id = $1
         ORDER BY cp.joined_at ASC, cp.user_id ASC
         LIMIT $2 OFFSET $3`,
        [competitionId, limit, offset],
      );

      const count = await query(
        'SELECT COUNT(*)::int AS total FROM competition_participants WHERE competition_id = $1',
        [competitionId],
      );

      return res.json({
        participants: result.rows,
        total: Number(count.rows[0]?.total ?? 0),
        limit,
        offset,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch challenge participants' });
    }
  },
);

router.get(
  '/api/competitions/:competitionId/admin/participants/:participantId/evidence',
  requireAuth,
  async (req, res) => {
    try {
      const { competitionId, participantId } = req.params;
      const userId = res.locals.authenticatedUserId as string;

      const owner = await query(
        `SELECT id, status, metric FROM competitions
         WHERE id = $1 AND creator_id = $2`,
        [competitionId, userId],
      );
      if (!owner.rows.length) {
        return res.status(404).json({ error: 'Challenge not found or you are not its creator' });
      }

      const participant = await query(
        `SELECT cp.user_id, u.username, u.display_name, cp.joined_at
         FROM competition_participants cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.competition_id = $1 AND cp.user_id = $2`,
        [competitionId, participantId],
      );
      if (!participant.rows.length) {
        return res.status(404).json({ error: 'Participant not found in this challenge' });
      }

      const scores = await query(
        `SELECT s.activity_id, s.metric, s.score, s.scoring_status,
                s.provenance, s.calculated_at,
                a.activity_type, a.distance_km, a.elapsed_seconds,
                a.started_at, a.finished_at
         FROM competition_activity_scores s
         LEFT JOIN activities a ON a.id = s.activity_id
         WHERE s.competition_id = $1 AND s.user_id = $2
         ORDER BY s.calculated_at DESC`,
        [competitionId, participantId],
      );

      const flags = await query(
        `SELECT id, activity_id, reason, details, created_at,
                resolved_at, resolved_by, resolution_note
         FROM competition_activity_flags
         WHERE competition_id = $1 AND user_id = $2
         ORDER BY created_at DESC`,
        [competitionId, participantId],
      );

      return res.json({
        challenge: {
          id: owner.rows[0].id,
          status: owner.rows[0].status,
          metric: owner.rows[0].metric,
        },
        participant: participant.rows[0],
        scores: scores.rows,
        flags: flags.rows,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch participant evidence' });
    }
  },
);

// Corrections are restricted to the review window and SCORED records.
// Each correction stores its reason and before/after values in the audit log.
router.post(
  '/api/competitions/:competitionId/admin/activities/:activityId/score',
  requireAuth,
  async (req, res) => {
    let client;
    let inTransaction = false;

    try {
      const { competitionId, activityId } = req.params;
      const userId = res.locals.authenticatedUserId as string;
      const body = req.body as { score?: unknown; reason?: unknown };
      const newScore = Number(body.score);
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

      if (body.score === undefined || body.score === null ||
          !Number.isFinite(newScore) || newScore < 0 || newScore > 1000000000) {
        return res.status(400).json({ error: 'score must be a finite non-negative number' });
      }
      if (!reason || reason.length > 1000) {
        return res.status(400).json({ error: 'A correction reason of 1–1000 characters is required' });
      }

      client = await pool.connect();
      await client.query('BEGIN');
      inTransaction = true;

      const challenge = await client.query(
        `SELECT id, creator_id, status
         FROM competitions WHERE id = $1 FOR UPDATE`,
        [competitionId],
      );
      if (!challenge.rows.length || challenge.rows[0].creator_id !== userId) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({ error: 'Challenge not found or you are not its creator' });
      }
      if (challenge.rows[0].status !== 'UNDER_REVIEW') {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({ error: 'Score corrections are only allowed during challenge review' });
      }

      const existing = await client.query(
        `SELECT activity_id, user_id, score, metric, scoring_status, provenance
         FROM competition_activity_scores
         WHERE competition_id = $1 AND activity_id = $2
         FOR UPDATE`,
        [competitionId, activityId],
      );
      if (!existing.rows.length) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({ error: 'Scored activity not found for this challenge' });
      }
      if (existing.rows[0].scoring_status !== 'SCORED') {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({
          error: 'Resolve the activity review first; only SCORED records can be corrected',
        });
      }

      const before = existing.rows[0];

      // Persist the correction separately so automatic activity recalculation
      // cannot silently replace the organizer's reviewed score.
      await client.query(
        `INSERT INTO competition_activity_score_overrides
           (competition_id, activity_id, user_id, corrected_score,
            actor_user_id, reason, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (competition_id, activity_id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           corrected_score = EXCLUDED.corrected_score,
           actor_user_id = EXCLUDED.actor_user_id,
           reason = EXCLUDED.reason,
           updated_at = NOW()`,
        [competitionId, activityId, before.user_id, newScore, userId, reason],
      );

      const updated = await client.query(
        `UPDATE competition_activity_scores
         SET score = $3,
             provenance = provenance || jsonb_build_object(
               'lastManualCorrection', jsonb_build_object(
                 'actorUserId', $4::text,
                 'reason', $5::text,
                 'previousScore', $6::numeric,
                 'correctedScore', $3::numeric,
                 'correctedAt', NOW()
               )
             ),
             calculated_at = NOW()
         WHERE competition_id = $1 AND activity_id = $2
         RETURNING activity_id, user_id, metric, score, scoring_status, provenance, calculated_at`,
        [competitionId, activityId, newScore, userId, reason, before.score],
      );

      await client.query(
        `INSERT INTO competition_admin_audit
           (competition_id, actor_user_id, action_type, target_user_id,
            activity_id, reason, before_data, after_data)
         VALUES ($1, $2, 'SCORE_CORRECTED', $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [
          competitionId,
          userId,
          before.user_id,
          activityId,
          reason,
          JSON.stringify({
            score: before.score,
            metric: before.metric,
            scoringStatus: before.scoring_status,
          }),
          JSON.stringify({
            score: updated.rows[0].score,
            metric: updated.rows[0].metric,
            scoringStatus: updated.rows[0].scoring_status,
          }),
        ],
      );

      await client.query('COMMIT');
      inTransaction = false;
      return res.json({ corrected: true, score: updated.rows[0] });
    } catch (error) {
      if (client && inTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      console.error(error);
      return res.status(500).json({ error: 'Failed to correct challenge score' });
    } finally {
      client?.release();
    }
  },
);

router.get(
  '/api/competitions/:competitionId/admin/audit',
  requireAuth,
  async (req, res) => {
    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;
      const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '50'), 10) || 50));
      const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? '0'), 10) || 0);

      const owner = await query(
        'SELECT id FROM competitions WHERE id = $1 AND creator_id = $2',
        [competitionId, userId],
      );
      if (!owner.rows.length) {
        return res.status(404).json({ error: 'Challenge not found or you are not its creator' });
      }

      const result = await query(
        `SELECT id, actor_user_id, action_type, target_user_id,
                activity_id, reason, before_data, after_data, created_at
         FROM competition_admin_audit
         WHERE competition_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [competitionId, limit, offset],
      );
      return res.json({ audit: result.rows, limit, offset });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch organizer audit history' });
    }
  },
);

// Cancellation is creator-only and unavailable once review/finalization starts.
router.post(
  '/api/competitions/:competitionId/cancel',
  requireAuth,
  async (req, res) => {
    let client;
    let inTransaction = false;

    try {
      const { competitionId } = req.params;
      const userId = res.locals.authenticatedUserId as string;
      const body = req.body as { reason?: unknown };
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

      if (!reason || reason.length > 1000) {
        return res.status(400).json({ error: 'A cancellation reason of 1–1000 characters is required' });
      }

      client = await pool.connect();
      await client.query('BEGIN');
      inTransaction = true;

      const result = await client.query(
        `SELECT id, creator_id, name, status
         FROM competitions WHERE id = $1 FOR UPDATE`,
        [competitionId],
      );
      if (!result.rows.length || result.rows[0].creator_id !== userId) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({ error: 'Challenge not found or you are not its creator' });
      }

      const challenge = result.rows[0];
      if (!['DRAFT', 'REGISTRATION_OPEN', 'ACTIVE'].includes(challenge.status)) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(409).json({ error: 'This challenge can no longer be cancelled through this endpoint' });
      }

      await client.query(
        `UPDATE competitions SET status = 'CANCELLED' WHERE id = $1`,
        [competitionId],
      );
      await client.query(
        `INSERT INTO competition_admin_audit
           (competition_id, actor_user_id, action_type, reason, before_data, after_data)
         VALUES ($1, $2, 'CHALLENGE_CANCELLED', $3, $4::jsonb, $5::jsonb)`,
        [
          competitionId,
          userId,
          reason,
          JSON.stringify({ status: challenge.status }),
          JSON.stringify({ status: 'CANCELLED', name: challenge.name }),
        ],
      );

      await client.query('COMMIT');
      inTransaction = false;
      return res.json({ cancelled: true, status: 'CANCELLED' });
    } catch (error) {
      if (client && inTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      console.error(error);
      return res.status(500).json({ error: 'Failed to cancel challenge' });
    } finally {
      client?.release();
    }
  },
);

// Phase 7 operational visibility: notification delivery and reward status.
// Access is restricted to the competition creator.

router.get(
  '/api/competitions/:competitionId/admin/notification-failures',
  requireAuth,
  async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const { competitionId } = req.params;

      const owner = await query(
        `SELECT id FROM competitions WHERE id = $1 AND creator_id = $2`,
        [competitionId, userId],
      );

      if (owner.rows.length === 0) {
        return res.status(404).json({ error: 'Competition not found' });
      }

      const result = await query(
        `SELECT
           d.id,
           d.notification_id,
           d.provider,
           d.attempt_number,
           d.error_message,
           d.attempted_at,
           d.next_retry_at,
           n.user_id AS recipient_user_id,
           n.type AS notification_type,
           n.title AS notification_title
         FROM notification_delivery_attempts d
         JOIN notifications n ON n.id = d.notification_id
         WHERE n.competition_id = $1
           AND d.status = 'FAILED'
         ORDER BY d.attempted_at DESC
         LIMIT 200`,
        [competitionId],
      );

      return res.json({
        items: result.rows,
        count: result.rows.length,
        limit: 200,
      });
    } catch (error) {
      console.error('Failed to load notification delivery failures:', error);
      return res.status(500).json({
        error: 'Failed to load notification delivery failures',
      });
    }
  },
);

router.get(
  '/api/competitions/:competitionId/admin/rewards',
  requireAuth,
  async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const { competitionId } = req.params;

      const owner = await query(
        `SELECT id FROM competitions WHERE id = $1 AND creator_id = $2`,
        [competitionId, userId],
      );

      if (owner.rows.length === 0) {
        return res.status(404).json({ error: 'Competition not found' });
      }

      const result = await query(
        `SELECT
           r.id,
           r.participant_id,
           u.username,
           u.display_name,
           r.reward_name,
           r.status,
           r.notes,
           r.updated_at,
           r.updated_by
         FROM competition_reward_status r
         JOIN users u ON u.id = r.participant_id
         WHERE r.competition_id = $1
         ORDER BY r.updated_at DESC`,
        [competitionId],
      );

      return res.json({ items: result.rows, count: result.rows.length });
    } catch (error) {
      console.error('Failed to load competition rewards:', error);
      return res.status(500).json({
        error: 'Failed to load competition rewards',
      });
    }
  },
);

router.put(
  '/api/competitions/:competitionId/admin/rewards/:participantId',
  requireAuth,
  async (req, res) => {
    const client = await pool.connect();

    try {
      const userId = res.locals.authenticatedUserId as string;
      const { competitionId, participantId } = req.params;
      const rewardName = String(req.body?.rewardName ?? '').trim();
      const status = String(req.body?.status ?? '').trim().toUpperCase();
      const reason = String(req.body?.reason ?? '').trim();
      const notes = String(req.body?.notes ?? '').trim();

      const allowedStatuses = [
        'PENDING',
        'APPROVED',
        'FULFILLED',
        'CANCELLED',
      ];

      if (!rewardName || rewardName.length > 120) {
        return res.status(400).json({
          error: 'rewardName is required and must be at most 120 characters',
        });
      }

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Invalid reward status',
          allowedStatuses,
        });
      }

      if (!reason || reason.length > 1000) {
        return res.status(400).json({
          error: 'A reason of at most 1000 characters is required',
        });
      }

      if (notes.length > 2000) {
        return res.status(400).json({
          error: 'Notes must be at most 2000 characters',
        });
      }

      await client.query('BEGIN');

      const owner = await client.query(
        `SELECT id FROM competitions
         WHERE id = $1 AND creator_id = $2
         FOR UPDATE`,
        [competitionId, userId],
      );

      if (owner.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Competition not found' });
      }

      const participant = await client.query(
        `SELECT user_id FROM competition_participants
         WHERE competition_id = $1 AND user_id = $2`,
        [competitionId, participantId],
      );

      if (participant.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          error: 'Participant is not registered for this competition',
        });
      }

      const previous = await client.query(
        `SELECT status, notes FROM competition_reward_status
         WHERE competition_id = $1
           AND participant_id = $2
           AND reward_name = $3
         FOR UPDATE`,
        [competitionId, participantId, rewardName],
      );

      const saved = await client.query(
        `INSERT INTO competition_reward_status (
           competition_id, participant_id, reward_name,
           status, notes, updated_by, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (competition_id, participant_id, reward_name)
         DO UPDATE SET
           status = EXCLUDED.status,
           notes = EXCLUDED.notes,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING id, competition_id, participant_id,
                   reward_name, status, notes, updated_by, updated_at`,
        [
          competitionId,
          participantId,
          rewardName,
          status,
          notes || null,
          userId,
        ],
      );

      await client.query(
        `INSERT INTO competition_admin_audit (
           competition_id, actor_user_id, target_user_id,
           action_type, reason, before_data, after_data
         )
         VALUES ($1, $2, $3, 'REWARD_STATUS_UPDATED', $4, $5::jsonb, $6::jsonb)`,
        [
          competitionId,
          userId,
          participantId,
          reason,
          JSON.stringify(previous.rows[0] ?? {}),
          JSON.stringify({
            rewardName,
            status,
            notes: notes || null,
          }),
        ],
      );

      await client.query('COMMIT');
      return res.json({ reward: saved.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Failed to update reward status:', error);
      return res.status(500).json({ error: 'Failed to update reward status' });
    } finally {
      client.release();
    }
  },
);




app.use(router);
}

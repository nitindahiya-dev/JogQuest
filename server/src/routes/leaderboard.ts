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

  const REVIEW_DEADLINE_HOURS = 48;

  const isPlatformAdmin = async (db: any, userId: string): Promise<boolean> => {
    const result = await db.query(
      `SELECT 1 FROM platform_admins WHERE user_id = $1`,
      [userId],
    );
    return result.rows.length > 0;
  };

  const finalizeCompetition = async (
    client: any,
    competitionId: string,
    metric: string,
    actorUserId: string | null,
    auditReason: string,
  ) => {
    // Never publish while any flag or scoring review remains unresolved.
    const pending = await client.query(
      `SELECT
         (SELECT COUNT(*)::int
          FROM competition_activity_flags
          WHERE competition_id = $1 AND resolved_at IS NULL) AS unresolved_flags,
         (SELECT COUNT(*)::int
          FROM competition_activity_scores
          WHERE competition_id = $1 AND scoring_status = 'REVIEW') AS pending_scores`,
      [competitionId],
    );

    const unresolvedFlags = Number(pending.rows[0]?.unresolved_flags ?? 0);
    const pendingScores = Number(pending.rows[0]?.pending_scores ?? 0);

    if (unresolvedFlags > 0 || pendingScores > 0) {
      return {
        finalized: false,
        unresolvedFlags,
        pendingScores,
      };
    }

    // Idempotency guard. The caller must hold the competition row lock.
    const existing = await client.query(
      `SELECT 1 FROM competition_results WHERE competition_id = $1 LIMIT 1`,
      [competitionId],
    );

    if (existing.rows.length) {
      return { finalized: false, alreadyFinalized: true };
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
      [competitionId, metric],
    );

    // Preserve the existing badge-award rules.
    await client.query(
      `INSERT INTO user_competition_badges (user_id, badge_code, competition_id)
       SELECT cr.user_id, badge.code, cr.competition_id
       FROM competition_results cr
       CROSS JOIN LATERAL (
         SELECT 'CHALLENGE_PARTICIPANT'::varchar(40) AS code
         UNION ALL
         SELECT 'CHALLENGE_FINISHER'::varchar(40) WHERE cr.score > 0
         UNION ALL
         SELECT CASE cr.rank_position
           WHEN 1 THEN 'CHALLENGE_GOLD'
           WHEN 2 THEN 'CHALLENGE_SILVER'
           WHEN 3 THEN 'CHALLENGE_BRONZE'
         END
         WHERE cr.rank_position BETWEEN 1 AND 3
         UNION ALL
         SELECT 'CHALLENGE_PERSONAL_BEST'::varchar(40)
         WHERE EXISTS (
           SELECT 1
           FROM competition_results previous
           WHERE previous.user_id = cr.user_id
             AND previous.metric = cr.metric
             AND previous.competition_id <> cr.competition_id
         )
         AND cr.score > COALESCE((
           SELECT MAX(previous.score)
           FROM competition_results previous
           WHERE previous.user_id = cr.user_id
             AND previous.metric = cr.metric
             AND previous.competition_id <> cr.competition_id
         ), -1)
       ) badge
       WHERE cr.competition_id = $1
       ON CONFLICT (user_id, badge_code, competition_id) DO NOTHING`,
      [competitionId],
    );

    await client.query(
      `UPDATE competitions
       SET status = 'COMPLETED'
       WHERE id = $1 AND status = 'UNDER_REVIEW'`,
      [competitionId],
    );

    await client.query(
      `INSERT INTO competition_admin_audit (
         competition_id, actor_user_id, action_type, reason,
         before_data, after_data
       )
       VALUES (
         $1, $2, $3, $4,
         $5::jsonb, $6::jsonb
       )`,
      [
        competitionId,
        actorUserId,
        actorUserId ? 'COMPETITION_MANUALLY_FINALIZED' : 'COMPETITION_AUTO_FINALIZED',
        auditReason,
        JSON.stringify({ status: 'UNDER_REVIEW' }),
        JSON.stringify({ status: 'COMPLETED', metric }),
      ],
    );

    const published = await client.query(
      `SELECT rank_position, user_id, score, metric, finalized_at
       FROM competition_results
       WHERE competition_id = $1
       ORDER BY rank_position ASC`,
      [competitionId],
    );

    return {
      finalized: true,
      results: published.rows,
    };
  };

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
        const {
          name,
          description,
          metric,
          startAt,
          endAt,
          targetDistanceKm,
          maxParticipants,
          latitude,
          longitude,
          entryType = 'FREE',
          entryFeePaise = 0,
          prizeType = 'NONE',
          cashPrizePaise = 0,
          prizeDistribution = {},
        } = req.body;

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

        const startDate = new Date(startAt);
        const endDate = new Date(endAt);

        if (
          !startAt ||
          !endAt ||
          !Number.isFinite(startDate.getTime()) ||
          !Number.isFinite(endDate.getTime()) ||
          endDate.getTime() <= startDate.getTime()
        ) {
          return res.status(400).json({
            error: 'A valid start date and an end date after the start date are required',
          });
        }

        if (
          endDate.getTime() - startDate.getTime() > 90 * 86400000
        ) {
          return res.status(400).json({
            error: 'Challenge duration cannot exceed 90 days',
          });
        }

        const cleanTargetDistanceKm =
          targetDistanceKm === undefined ||
          targetDistanceKm === null ||
          targetDistanceKm === ''
            ? null
            : Number(targetDistanceKm);

        const cleanMaxParticipants =
          maxParticipants === undefined ||
          maxParticipants === null ||
          maxParticipants === ''
            ? null
            : Number(maxParticipants);

        if (
          cleanMaxParticipants !== null &&
          (!Number.isSafeInteger(cleanMaxParticipants) ||
            cleanMaxParticipants < 1 ||
            cleanMaxParticipants > 100000)
        ) {
          return res.status(400).json({
            error: 'Maximum participants must be a whole number between 1 and 100000',
          });
        }

        if (
          metric === 'DISTANCE' &&
          (
            !Number.isFinite(cleanTargetDistanceKm) ||
            cleanTargetDistanceKm! <= 0 ||
            cleanTargetDistanceKm! > 100000
          )
        ) {
          return res.status(400).json({
            error: 'Distance challenges require a target distance greater than 0 and no more than 100000 km',
          });
        }

        if (
          metric !== 'DISTANCE' &&
          cleanTargetDistanceKm !== null
        ) {
          return res.status(400).json({
            error: 'Target distance is only valid for distance challenges',
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

        const normalizedEntryType = String(entryType).trim().toUpperCase();
        const normalizedPrizeType = String(prizeType).trim().toUpperCase();
        const feePaise = Number(entryFeePaise);
        const cashPaise = Number(cashPrizePaise);

        if (!['FREE', 'PAID'].includes(normalizedEntryType)) {
          return res.status(400).json({ error: 'Entry type must be FREE or PAID' });
        }
        if (
          !Number.isSafeInteger(feePaise) ||
          feePaise < 0 ||
          (normalizedEntryType === 'FREE' && feePaise !== 0) ||
          (normalizedEntryType === 'PAID' && feePaise <= 0)
        ) {
          return res.status(400).json({
            error: 'Invalid entry fee. Use a positive amount in paise for paid entry.',
          });
        }
        if (!['NONE', 'CASH', 'SPONSORED', 'MIXED'].includes(normalizedPrizeType)) {
          return res.status(400).json({ error: 'Invalid prize type' });
        }
        if (!Number.isSafeInteger(cashPaise) || cashPaise < 0) {
          return res.status(400).json({
            error: 'Cash prize must be a non-negative amount in paise',
          });
        }
        if (
          ['NONE', 'SPONSORED'].includes(normalizedPrizeType) &&
          cashPaise !== 0
        ) {
          return res.status(400).json({
            error: 'Cash prize amount does not match the selected prize type',
          });
        }
        if (!['CASH', 'MIXED'].includes(normalizedPrizeType) && cashPaise !== 0) {
          return res.status(400).json({
            error: 'Select a cash prize type to configure a cash prize',
          });
        }
        if (
          !prizeDistribution ||
          typeof prizeDistribution !== 'object' ||
          Array.isArray(prizeDistribution)
        ) {
          return res.status(400).json({
            error: 'Prize distribution must be an object',
          });
        }

        const distribution: Record<string, number> = {};
        for (const place of ['first', 'second', 'third']) {
          const amount = Number(
            (prizeDistribution as Record<string, unknown>)[place] ?? 0,
          );
          if (!Number.isSafeInteger(amount) || amount < 0) {
            return res.status(400).json({
              error: 'Prize distribution amounts must be non-negative whole paise values',
            });
          }
          distribution[place] = amount;
        }

        const distributionTotal = Object.values(distribution).reduce(
          (sum, amount) => sum + amount,
          0,
        );
        if (
          !Number.isSafeInteger(distributionTotal) ||
          distributionTotal !== cashPaise
        ) {
          return res.status(400).json({
            error: 'First, second, and third place allocations must add up to the total cash prize',
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
          target_distance_km,
          max_participants,
          status,
          registration_opens_at,
          registration_closes_at,
          latitude,
          longitude,
          entry_type,
          entry_fee_paise,
          prize_type,
          cash_prize_paise,
          prize_distribution,
          currency
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          'DRAFT', NULL, NULL, $9, $10,
          $11, $12, $13, $14, $15::jsonb, 'INR'
        )
        RETURNING
          id, name, description, creator_id, metric, start_at, end_at,
          target_distance_km, status,
          registration_opens_at, registration_closes_at, max_participants,
          is_public, created_at, latitude, longitude, entry_type,
          entry_fee_paise, prize_type, cash_prize_paise, prize_distribution, currency
        `,
          [
            cleanName,
            cleanDescription,
            userId,
            metric,
            startDate,
            endDate,
            cleanTargetDistanceKm,
            cleanMaxParticipants,
            cleanLatitude,
            cleanLongitude,
            normalizedEntryType,
            feePaise,
            normalizedPrizeType,
            cashPaise,
            JSON.stringify(distribution),
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
          startAt?: unknown;
          endAt?: unknown;
          targetDistanceKm?: unknown;
          maxParticipants?: unknown;
          entryType?: unknown;
          entryFeePaise?: unknown;
          prizeType?: unknown;
          cashPrizePaise?: unknown;
          prizeDistribution?: unknown;
        };

        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const description =
          typeof body.description === 'string' ? body.description.trim() : '';
        const metric = body.metric;
        const startAt =
          typeof body.startAt === 'string' ? new Date(body.startAt) : new Date('');
        const endAt =
          typeof body.endAt === 'string' ? new Date(body.endAt) : new Date('');
        const targetDistanceKm =
          body.targetDistanceKm === null || body.targetDistanceKm === undefined ||
          body.targetDistanceKm === ''
            ? null
            : Number(body.targetDistanceKm);

        const maxParticipants =
          body.maxParticipants === null ||
          body.maxParticipants === undefined ||
          body.maxParticipants === ''
            ? null
            : Number(body.maxParticipants);

        if (
          maxParticipants !== null &&
          (!Number.isSafeInteger(maxParticipants) ||
            maxParticipants < 1 ||
            maxParticipants > 100000)
        ) {
          return res.status(400).json({
            error: 'Maximum participants must be a whole number between 1 and 100000',
          });
        }

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
        if (
          Number.isNaN(startAt.getTime()) ||
          Number.isNaN(endAt.getTime()) ||
          endAt.getTime() <= startAt.getTime()
        ) {
          return res.status(400).json({
            error: 'A valid start date and end date after the start date are required',
          });
        }

        if (
          metric === 'DISTANCE' &&
          (targetDistanceKm === null ||
            !Number.isFinite(targetDistanceKm) ||
            targetDistanceKm <= 0 ||
            targetDistanceKm > 100000)
        ) {
          return res.status(400).json({
            error: 'Distance challenges require a target distance greater than 0 km',
          });
        }

        if (metric !== 'DISTANCE' && targetDistanceKm !== null) {
          return res.status(400).json({
            error: 'Target distance is only valid for distance challenges',
          });
        }

        const entryType = body.entryType ?? 'FREE';
        const entryFeePaise = Number(body.entryFeePaise ?? 0);
        const prizeType = body.prizeType ?? 'NONE';
        const cashPrizePaise = Number(body.cashPrizePaise ?? 0);
        const rawDistribution = body.prizeDistribution;

        if (!['FREE', 'PAID'].includes(String(entryType))) {
          return res.status(400).json({ error: 'Invalid entry type' });
        }

        if (!Number.isSafeInteger(entryFeePaise) || entryFeePaise < 0) {
          return res.status(400).json({ error: 'Invalid entry fee amount' });
        }

        if (
          (entryType === 'PAID' && entryFeePaise <= 0) ||
          (entryType === 'FREE' && entryFeePaise !== 0)
        ) {
          return res.status(400).json({
            error: 'Paid entries require a positive fee; free entries must have zero fee',
          });
        }

        if (!['NONE', 'CASH', 'SPONSORED', 'MIXED'].includes(String(prizeType))) {
          return res.status(400).json({ error: 'Invalid prize type' });
        }

        if (!Number.isSafeInteger(cashPrizePaise) || cashPrizePaise < 0) {
          return res.status(400).json({ error: 'Invalid cash prize amount' });
        }

        if (
          rawDistribution !== undefined &&
          (!rawDistribution || typeof rawDistribution !== 'object' || Array.isArray(rawDistribution))
        ) {
          return res.status(400).json({ error: 'Invalid prize distribution' });
        }

        const distributionInput = (rawDistribution ?? {}) as Record<string, unknown>;
        const distribution = {
          first: Number(distributionInput.first ?? 0),
          second: Number(distributionInput.second ?? 0),
          third: Number(distributionInput.third ?? 0),
        };

        if (
          !Object.values(distribution).every(
            value => Number.isSafeInteger(value) && value >= 0,
          )
        ) {
          return res.status(400).json({
            error: 'Prize allocations must be non-negative whole paise amounts',
          });
        }

        const hasCashPrize = prizeType === 'CASH' || prizeType === 'MIXED';

        if (
          (hasCashPrize && cashPrizePaise <= 0) ||
          (!hasCashPrize && cashPrizePaise !== 0)
        ) {
          return res.status(400).json({
            error: 'Cash prize total must match the selected prize type',
          });
        }

        const distributionTotal =
          distribution.first + distribution.second + distribution.third;

        if (
          !Number.isSafeInteger(distributionTotal) ||
          distributionTotal !== cashPrizePaise
        ) {
          return res.status(400).json({
            error: 'Prize allocations must add up to the total cash prize',
          });
        }

        await client.query('BEGIN');
        inTransaction = true;

        const current = await client.query(
          `SELECT id, creator_id, name, description, metric, status, start_at, end_at,
                target_distance_km, max_participants, entry_type,
                entry_fee_paise, prize_type, cash_prize_paise, prize_distribution
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
             start_at = $5,
             end_at = $6,
             target_distance_km = $7,
             max_participants = $8,
             entry_type = $9,
             entry_fee_paise = $10,
             prize_type = $11,
             cash_prize_paise = $12,
             prize_distribution = $13::jsonb
         WHERE id = $1
         RETURNING id, name, description, creator_id, metric, start_at, end_at,
                   target_distance_km, status, registration_opens_at,
                   registration_closes_at, max_participants, is_public,
                   created_at, latitude, longitude, entry_type, entry_fee_paise,
                   prize_type, cash_prize_paise, prize_distribution, currency`,
          [
            competitionId,
            name,
            description,
            metric,
            startAt.toISOString(),
            endAt.toISOString(),
            targetDistanceKm,
            maxParticipants,
            entryType,
            entryFeePaise,
            prizeType,
            cashPrizePaise,
            JSON.stringify(distribution),
          ],
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
              target_distance_km: before.target_distance_km,
              max_participants: before.max_participants,
              entry_type: before.entry_type,
              entry_fee_paise: before.entry_fee_paise,
              prize_type: before.prize_type,
              cash_prize_paise: before.cash_prize_paise,
              prize_distribution: before.prize_distribution,
            }),
            JSON.stringify({
              name,
              description,
              metric,
              start_at: updated.rows[0].start_at,
              end_at: updated.rows[0].end_at,
              target_distance_km: targetDistanceKm,
              max_participants: maxParticipants,
              entry_type: entryType,
              entry_fee_paise: entryFeePaise,
              prize_type: prizeType,
              cash_prize_paise: cashPrizePaise,
              prize_distribution: distribution,
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
          `SELECT id, creator_id, status, metric, start_at, end_at,
                target_distance_km,
                entry_type, entry_fee_paise, cash_prize_paise
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

        if (draft.entry_type === 'PAID' || Number(draft.cash_prize_paise) > 0) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({
            error: 'Paid entry and cash prizes cannot be published yet. Payment collection and payout support are not available.',
            code: 'FINANCIAL_FEATURE_NOT_ACTIVE',
          });
        }

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

        if (
          draft.metric === 'DISTANCE' &&
          (
            !Number.isFinite(Number(draft.target_distance_km)) ||
            Number(draft.target_distance_km) <= 0
          )
        ) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({
            error: 'Distance challenges require a valid target distance before publishing',
            code: 'DISTANCE_TARGET_REQUIRED',
          });
        }

        const published = await client.query(
          `UPDATE competitions
         SET status = 'REGISTRATION_OPEN',
             registration_opens_at = NOW(),
             registration_closes_at = start_at
         WHERE id = $1
         RETURNING id, name, description, creator_id, metric, start_at, end_at,
                   target_distance_km,
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
    '/api/competitions/my-drafts',
    requireAuth,
    async (_req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;

        const result = await query(
          `
        SELECT
          c.id,
          c.name,
          c.description,
          c.status,
          c.metric,
          c.start_at,
          c.end_at,
          c.target_distance_km,
          c.created_at,
          c.latitude,
          c.longitude,
          COUNT(cp.user_id)::int AS participants_count
        FROM competitions c
        LEFT JOIN competition_participants cp
          ON cp.competition_id = c.id
        WHERE c.creator_id = $1
          AND c.status = 'DRAFT'
        GROUP BY c.id
        ORDER BY c.created_at DESC
        `,
          [userId],
        );

        return res.json(result.rows);
      } catch (error) {
        console.error('Failed to fetch creator drafts:', error);
        return res.status(500).json({
          error: 'Failed to fetch your drafts',
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
          c.entry_type,
          c.entry_fee_paise,
          c.prize_type,
          c.cash_prize_paise,
          c.prize_distribution,
          c.currency,
          c.creator_id,
          c.metric,
          c.start_at,
          c.end_at,
          c.target_distance_km,
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
        SELECT id, metric, status
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
            rank,
            participant_count
          FROM (
            -- Active challenges use the current calculated score rows.
            SELECT
              user_id,
              total_score,
              review_count,
              ROW_NUMBER() OVER (
                ORDER BY total_score DESC, display_name ASC, user_id ASC
              )::int AS rank,
              COUNT(*) OVER ()::int AS participant_count
            FROM participant_totals
            WHERE $3::text <> 'COMPLETED'

            UNION ALL

            -- Completed challenges use the immutable official result snapshot.
            SELECT
              cr.user_id,
              cr.score::numeric AS total_score,
              COALESCE((
                SELECT COUNT(*)::int
                FROM competition_activity_scores cas
                WHERE cas.competition_id = cr.competition_id
                  AND cas.user_id = cr.user_id
                  AND cas.scoring_status = 'REVIEW'
              ), 0)::int AS review_count,
              cr.rank_position::int AS rank,
              COUNT(*) OVER ()::int AS participant_count
            FROM competition_results cr
            WHERE cr.competition_id = $1
              AND $3::text = 'COMPLETED'
          ) ranking_sources
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
          [competitionId, userId, competitionResult.rows[0].status],
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
            end_at,
            status
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
        WITH ranking_sources AS (
          -- Live ranking for all challenges that are not finalized.
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
            AND $3::text <> 'COMPLETED'

          UNION ALL

          -- Published ranking for completed challenges.
          SELECT
            cr.rank_position::int AS rank,
            cr.user_id,
            u.username,
            u.display_name,
            u.avatar_url,
            cr.score::double precision AS score,
            COALESCE((
              SELECT COUNT(*)::int
              FROM competition_activity_scores s
              WHERE s.competition_id = cr.competition_id
                AND s.user_id = cr.user_id
                AND s.scoring_status = 'REVIEW'
            ), 0)::int AS review_count
          FROM competition_results cr
          JOIN users u ON u.id = cr.user_id
          WHERE cr.competition_id = $1
            AND $3::text = 'COMPLETED'
        )
        SELECT
          rank,
          user_id,
          username,
          display_name,
          avatar_url,
          score,
          review_count
        FROM ranking_sources
        ORDER BY rank ASC
        `,
          [competitionId, competition.metric, competition.status],
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
          max_participants,
          entry_type,
          entry_fee_paise
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

        if (competition.entry_type === 'PAID') {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(402).json({
            error: 'This challenge requires payment. Paid entry is not available yet.',
            code: 'PAYMENT_REQUIRED',
            entryFeePaise: Number(competition.entry_fee_paise),
            currency: 'INR',
          });
        }

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
         SET status = 'UNDER_REVIEW',
             review_deadline_at = COALESCE(
               review_deadline_at,
               NOW() + ($2 * INTERVAL '1 hour')
             )
         WHERE id = $1`,
          [competitionId, REVIEW_DEADLINE_HOURS],
        );

        const flags = await client.query(
          `SELECT COUNT(*)::int AS unresolved_count
         FROM competition_activity_flags
         WHERE competition_id = $1
           AND resolved_at IS NULL`,
          [competitionId],
        );

        const pendingScores = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM competition_activity_scores
           WHERE competition_id = $1
             AND scoring_status = 'REVIEW'`,
          [competitionId],
        );

        await client.query('COMMIT');
        inTransaction = false;

        return res.json({
          status: 'UNDER_REVIEW',
          unresolvedFlags: Number(flags.rows[0]?.unresolved_count ?? 0),
          pendingScores: Number(pendingScores.rows[0]?.count ?? 0),
          reviewDeadlineAt: new Date(
            Date.now() + REVIEW_DEADLINE_HOURS * 60 * 60 * 1000
          ).toISOString(),
          canFinalize:
            Number(flags.rows[0]?.unresolved_count ?? 0) === 0 &&
            Number(pendingScores.rows[0]?.count ?? 0) === 0,
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

        const pendingScores = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM competition_activity_scores
           WHERE competition_id = $1
             AND scoring_status = 'REVIEW'`,
          [competitionId],
        );

        if (Number(pendingScores.rows[0]?.count ?? 0) > 0) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({
            error: 'Resolve all pending scoring reviews before finalization',
            pendingScores: Number(pendingScores.rows[0].count),
          });
        }

        const finalization = await finalizeCompetition(
          client,
          competitionId,
          challenge.metric,
          userId,
          'Challenge results manually finalized by organizer.',
        );

        if (!finalization.finalized && !finalization.alreadyFinalized) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({
            error: 'Challenge still has unresolved review items',
            unresolvedFlags: finalization.unresolvedFlags,
            pendingScores: finalization.pendingScores,
          });
        }

        if (finalization.alreadyFinalized) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({
            error: 'Results already exist; refusing to overwrite official results',
          });
        }

        await client.query('COMMIT');
        inTransaction = false;

        return res.json({
          status: 'COMPLETED',
          alreadyFinalized: false,
          results: finalization.results,
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
   cr.finalized_at,
   COALESCE(
     (
       SELECT json_agg(
         json_build_object(
           'code', bd.code,
           'name', bd.name,
           'icon', bd.icon
         )
         ORDER BY bd.name
       )
       FROM user_competition_badges ub
       JOIN competition_badge_definitions bd
         ON bd.code = ub.badge_code
       WHERE ub.competition_id = cr.competition_id
         AND ub.user_id = cr.user_id
     ),
     '[]'::json
   ) AS badges
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
    '/api/competitions/:competitionId/admin/review-takeover',
    requireAuth,
    async (req, res) => {
      const client = await pool.connect();
      let inTransaction = false;

      try {
        const userId = res.locals.authenticatedUserId as string;
        const competitionId = req.params.competitionId;
        const reason = typeof req.body?.reason === 'string'
          ? req.body.reason.trim()
          : '';

        if (!reason || reason.length > 1000) {
          return res.status(400).json({
            error: 'A takeover reason of 1–1000 characters is required',
          });
        }

        await client.query('BEGIN');
        inTransaction = true;

        const admin = await isPlatformAdmin(client, userId);

        if (!admin) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(403).json({ error: 'Platform administrator access required' });
        }

        const result = await client.query(
          `SELECT id, status, review_deadline_at,
                  review_taken_over_at, creator_id
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

        if (challenge.status !== 'UNDER_REVIEW') {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'Challenge is not under review' });
        }

        if (!challenge.review_deadline_at ||
            new Date(challenge.review_deadline_at).getTime() > Date.now()) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({
            error: 'The organizer review deadline has not expired',
            reviewDeadlineAt: challenge.review_deadline_at,
          });
        }

        if (challenge.review_taken_over_at) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'Review has already been taken over' });
        }

        await client.query(
          `UPDATE competitions
           SET review_taken_over_at = NOW(),
               review_taken_over_by = $2,
               review_takeover_reason = $3
           WHERE id = $1`,
          [competitionId, userId, reason],
        );

        await client.query(
          `INSERT INTO competition_admin_audit (
             competition_id, actor_user_id, action_type,
             reason, before_data, after_data
           )
           VALUES ($1, $2, 'REVIEW_TAKEOVER', $3, $4::jsonb, $5::jsonb)`,
          [
            competitionId,
            userId,
            reason,
            JSON.stringify({ reviewTakenOver: false }),
            JSON.stringify({ reviewTakenOver: true }),
          ],
        );

        await client.query('COMMIT');
        inTransaction = false;

        return res.json({
          takenOver: true,
          competitionId,
          takenOverBy: userId,
        });
      } catch (error) {
        if (inTransaction) {
          await client.query('ROLLBACK').catch(() => undefined);
        }
        console.error('Failed to take over challenge review:', error);
        return res.status(500).json({ error: 'Failed to take over challenge review' });
      } finally {
        client.release();
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
          `SELECT c.id, c.status, c.metric, c.creator_id,
                  c.review_taken_over_at
           FROM competitions c
           WHERE c.id = $1
           FOR UPDATE`,
          [competitionId],
        );

        if (!owner.rows.length) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(404).json({ error: 'Challenge not found' });
        }

        const challenge = owner.rows[0];
        const platformAdmin = await isPlatformAdmin(client, actorUserId);

        if (challenge.status !== 'UNDER_REVIEW') {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({
            error: 'Activity decisions are only allowed during challenge review',
          });
        }

        if (challenge.review_taken_over_at) {
          if (!platformAdmin) {
            await client.query('ROLLBACK');
            inTransaction = false;
            return res.status(403).json({
              error: 'Review has been taken over by platform administration',
            });
          }
        } else if (challenge.creator_id !== actorUserId) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(403).json({
            error: 'Only the challenge creator can resolve review flags before takeover',
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
              ? (challenge.review_taken_over_at
                  ? 'ADMIN_ACTIVITY_FLAG_APPROVED'
                  : 'ACTIVITY_FLAG_APPROVED')
              : (challenge.review_taken_over_at
                  ? 'ADMIN_ACTIVITY_FLAG_REJECTED'
                  : 'ACTIVITY_FLAG_REJECTED'),
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



  // ============================================================
  // AUTOMATIC COMPETITION LIFECYCLE
  // ============================================================

  const processCompetitionLifecycle = async () => {
    const client = await pool.connect();
    let inTransaction = false;

    try {
      await client.query('BEGIN');
      inTransaction = true;

      // Multiple API instances can safely share this worker.
      const candidates = await client.query(
        `SELECT id, metric, start_at, end_at, status
         FROM competitions
         WHERE status IN ('REGISTRATION_OPEN', 'ACTIVE', 'UNDER_REVIEW')
           AND end_at <= NOW()
         ORDER BY end_at ASC
         LIMIT 20
         FOR UPDATE SKIP LOCKED`,
      );

      let processed = 0;
      let finalized = 0;
      let awaitingReview = 0;

      for (const challenge of candidates.rows) {
        // Rebuild scores from eligible participant activities.
        await client.query(
          `SELECT jq_recalculate_competition_activity(a.id)
           FROM activities a
           JOIN competition_participants cp
             ON cp.user_id = a.user_id
            AND cp.competition_id = $1
           WHERE a.started_at >= $2
             AND a.finished_at <= $3`,
          [challenge.id, challenge.start_at, challenge.end_at],
        );

        // Start review once, retaining the original deadline on later sweeps.
        await client.query(
          `UPDATE competitions
           SET status = 'UNDER_REVIEW',
               review_deadline_at = COALESCE(
                 review_deadline_at,
                 NOW() + ($2 * INTERVAL '1 hour')
               )
           WHERE id = $1
             AND status IN ('REGISTRATION_OPEN', 'ACTIVE', 'UNDER_REVIEW')`,
          [challenge.id, REVIEW_DEADLINE_HOURS],
        );

        const result = await finalizeCompetition(
          client,
          challenge.id,
          challenge.metric,
          null,
          'Automatically finalized after challenge end; no unresolved activity flags or scoring reviews remained.',
        );

        processed++;

        if (result.finalized) {
          finalized++;
        } else {
          awaitingReview++;
        }
      }

      await client.query('COMMIT');
      inTransaction = false;

      return { processed, finalized, awaitingReview };
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  };

  const competitionLifecycleTimer = setInterval(() => {
    void processCompetitionLifecycle()
      .then(result => {
        if (result.processed > 0) {
          console.info('Competition lifecycle sweep:', result);
        }
      })
      .catch(error => {
        console.error('Competition lifecycle sweep failed:', error);
      });
  }, 60 * 1000);

  // Run once shortly after the server starts.
  void processCompetitionLifecycle().catch(error => {
    console.error('Initial competition lifecycle sweep failed:', error);
  });


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
        await client.query('ROLLBACK').catch(() => { });
        console.error('Failed to update reward status:', error);
        return res.status(500).json({ error: 'Failed to update reward status' });
      } finally {
        client.release();
      }
    },
  );





  // ============================================================
  // PHASE 8: SPONSORED REWARDS
  // ============================================================

  // Process expired offers on reads and claim attempts. RETURN_TO_SPONSOR records
  // the quantity returned in the audit trail; it does not represent physical shipment.
  const processExpiredSponsoredRewards = async (competitionId?: string) => {
    const client = await pool.connect();
    let inTransaction = false;
    try {
      await client.query('BEGIN');
      inTransaction = true;

      const expired = await client.query(
        `SELECT o.*,
         COALESCE((
           SELECT COUNT(*)::int
           FROM competition_reward_claims cl
           WHERE cl.offer_id = o.id
             AND cl.status IN ('CLAIMED', 'APPROVED', 'FULFILLED')
         ), 0) AS claimed_count
       FROM competition_reward_offers o
       WHERE o.status IN ('ACTIVE', 'PAUSED')
         AND o.claim_deadline IS NOT NULL
         AND o.claim_deadline <= NOW()
         AND o.unclaimed_processed_at IS NULL
         AND ($1::uuid IS NULL OR o.competition_id = $1)
       FOR UPDATE`,
        [competitionId ?? null],
      );

      for (const offer of expired.rows) {
        const unclaimed = Math.max(0, Number(offer.quantity) - Number(offer.claimed_count));
        const returned = offer.unclaimed_policy === 'RETURN_TO_SPONSOR' ? unclaimed : 0;

        await client.query(
          `UPDATE competition_reward_offers
         SET status = 'CLOSED',
             unclaimed_quantity = $2,
             returned_quantity = $3,
             unclaimed_processed_at = NOW(),
             closed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
          [offer.id, unclaimed, returned],
        );

        await client.query(
          `INSERT INTO competition_admin_audit (
           competition_id, actor_user_id, action_type, reason,
           before_data, after_data
         )
         VALUES ($1, $2, 'SPONSORED_REWARD_EXPIRED', $3, $4::jsonb, $5::jsonb)`,
          [
            offer.competition_id,
            offer.created_by,
            'Claim deadline passed; unclaimed inventory was closed out automatically.',
            JSON.stringify({ status: offer.status, quantity: offer.quantity }),
            JSON.stringify({
              offerId: offer.id,
              status: 'CLOSED',
              unclaimedQuantity: unclaimed,
              returnedQuantity: returned,
              unclaimedPolicy: offer.unclaimed_policy,
            }),
          ],
        );

        await client.query(
          `INSERT INTO notifications
           (user_id, type, title, message, competition_id, dedupe_key)
         VALUES ($1, 'SPONSORED_REWARD_EXPIRED', $2, $3, $4, $5)
         ON CONFLICT (dedupe_key) DO NOTHING`,
          [
            offer.created_by,
            'Sponsored reward offer closed',
            `${offer.reward_name}: claim deadline passed. ${unclaimed} unit(s) remained unclaimed; ${returned} unit(s) recorded as returned to sponsor.`,
            offer.competition_id,
            `reward-expired:${offer.id}`,
          ],
        );
      }

      await client.query('COMMIT');
      inTransaction = false;
      return expired.rows.length;
    } catch (error) {
      if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  // Background expiry sweep; API reads and claim attempts also process expiry immediately.
  const sponsoredRewardExpiryTimer = setInterval(() => {
    void processExpiredSponsoredRewards().catch(error => {
      console.error('Sponsored reward expiry sweep failed:', error);
    });
  }, 5 * 60 * 1000);
  // Server process owns this periodic expiry sweep.

  router.post(
    '/api/competitions/:competitionId/admin/reward-offers',
    requireAuth,
    async (req, res) => {
      const client = await pool.connect();
      let inTransaction = false;

      try {
        const userId = res.locals.authenticatedUserId as string;
        const { competitionId } = req.params;

        const sponsorName = String(req.body?.sponsorName ?? '').trim();
        const rewardName = String(req.body?.rewardName ?? '').trim();
        const description = String(req.body?.description ?? '').trim();
        const quantity = Number(req.body?.quantity);
        const eligibilityType = String(req.body?.eligibilityType ?? '').trim().toUpperCase();
        const claimDeadline = req.body?.claimDeadline
          ? new Date(req.body.claimDeadline)
          : null;
        const unclaimedPolicy = String(
          req.body?.unclaimedPolicy ?? 'EXPIRE',
        ).trim().toUpperCase();

        const allowedEligibility = [
          'ALL_PARTICIPANTS',
          'TOP_3',
          'RANK_1',
          'RANK_2',
          'RANK_3',
        ];

        if (!sponsorName || sponsorName.length > 120) {
          return res.status(400).json({ error: 'Sponsor name is required (maximum 120 characters)' });
        }
        if (!rewardName || rewardName.length > 120) {
          return res.status(400).json({ error: 'Reward name is required (maximum 120 characters)' });
        }
        if (!description || description.length > 1000) {
          return res.status(400).json({ error: 'Description is required (maximum 1000 characters)' });
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
          return res.status(400).json({ error: 'Quantity must be a whole number between 1 and 100000' });
        }
        if (!allowedEligibility.includes(eligibilityType)) {
          return res.status(400).json({ error: 'Invalid reward eligibility type', allowedEligibility });
        }
        if (!['EXPIRE', 'RETURN_TO_SPONSOR'].includes(unclaimedPolicy)) {
          return res.status(400).json({ error: 'Invalid unclaimed reward policy' });
        }
        if (claimDeadline && Number.isNaN(claimDeadline.getTime())) {
          return res.status(400).json({ error: 'Invalid claim deadline' });
        }
        if (claimDeadline && claimDeadline.getTime() <= Date.now()) {
          return res.status(400).json({ error: 'Claim deadline must be in the future' });
        }

        await client.query('BEGIN');
        inTransaction = true;

        const owner = await client.query(
          `SELECT id, status FROM competitions
         WHERE id = $1 AND creator_id = $2
         FOR UPDATE`,
          [competitionId, userId],
        );

        if (!owner.rows.length) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(404).json({ error: 'Challenge not found' });
        }

        if (owner.rows[0].status !== 'COMPLETED') {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({
            error: 'Sponsored rewards can only be offered after official results are finalized',
          });
        }

        const saved = await client.query(
          `INSERT INTO competition_reward_offers (
           competition_id, sponsor_name, reward_name, description,
           quantity, eligibility_type, claim_deadline,
           unclaimed_policy, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
          [
            competitionId, sponsorName, rewardName, description,
            quantity, eligibilityType, claimDeadline,
            unclaimedPolicy, userId,
          ],
        );

        await client.query(
          `INSERT INTO competition_admin_audit (
           competition_id, actor_user_id, action_type, reason,
           before_data, after_data
         )
         VALUES ($1, $2, 'SPONSORED_REWARD_CREATED', $3, '{}'::jsonb, $4::jsonb)`,
          [
            competitionId,
            userId,
            `Created sponsored reward offer: ${rewardName}`,
            JSON.stringify({
              offerId: saved.rows[0].id,
              sponsorName,
              rewardName,
              quantity,
              eligibilityType,
              claimDeadline,
              unclaimedPolicy,
            }),
          ],
        );

        await client.query('COMMIT');
        inTransaction = false;
        return res.status(201).json({ offer: saved.rows[0] });
      } catch (error) {
        if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
        console.error('Failed to create sponsored reward:', error);
        return res.status(500).json({ error: 'Failed to create sponsored reward' });
      } finally {
        client.release();
      }
    },
  );

  router.patch(
    '/api/competitions/:competitionId/admin/reward-offers/:offerId',
    requireAuth,
    async (req, res) => {
      const client = await pool.connect();
      let inTransaction = false;
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { competitionId, offerId } = req.params;
        const status = String(req.body?.status ?? '').trim().toUpperCase();
        const reason = String(req.body?.reason ?? '').trim();

        if (!['ACTIVE', 'PAUSED', 'CLOSED'].includes(status)) {
          return res.status(400).json({ error: 'Status must be ACTIVE, PAUSED, or CLOSED' });
        }
        if (!reason || reason.length > 1000) {
          return res.status(400).json({ error: 'A reason (maximum 1000 characters) is required' });
        }

        await client.query('BEGIN');
        inTransaction = true;

        const owner = await client.query(
          `SELECT id FROM competitions
         WHERE id = $1 AND creator_id = $2
         FOR UPDATE`,
          [competitionId, userId],
        );
        if (!owner.rows.length) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(404).json({ error: 'Challenge not found' });
        }

        const previous = await client.query(
          `SELECT * FROM competition_reward_offers
         WHERE id = $1 AND competition_id = $2
         FOR UPDATE`,
          [offerId, competitionId],
        );
        if (!previous.rows.length) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(404).json({ error: 'Reward offer not found' });
        }

        const old = previous.rows[0];
        if (old.status === 'CLOSED' && status !== 'CLOSED') {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'Closed offers cannot be reopened' });
        }
        if (status === 'ACTIVE' && old.claim_deadline && new Date(old.claim_deadline).getTime() <= Date.now()) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'An offer past its claim deadline cannot be reactivated' });
        }

        let saved;
        if (status === 'CLOSED' && !old.unclaimed_processed_at) {
          const count = await client.query(
            `SELECT COUNT(*)::int AS claimed_count
           FROM competition_reward_claims
           WHERE offer_id = $1
             AND status IN ('CLAIMED', 'APPROVED', 'FULFILLED')`,
            [offerId],
          );
          const unclaimed = Math.max(0, Number(old.quantity) - Number(count.rows[0]?.claimed_count ?? 0));
          const returned = old.unclaimed_policy === 'RETURN_TO_SPONSOR' ? unclaimed : 0;
          saved = await client.query(
            `UPDATE competition_reward_offers
           SET status = 'CLOSED', unclaimed_quantity = $2, returned_quantity = $3,
               unclaimed_processed_at = NOW(), closed_at = NOW(), updated_at = NOW()
           WHERE id = $1 RETURNING *`,
            [offerId, unclaimed, returned],
          );
        } else {
          saved = await client.query(
            `UPDATE competition_reward_offers
           SET status = $2,
               closed_at = CASE WHEN $2 = 'CLOSED' THEN COALESCE(closed_at, NOW()) ELSE closed_at END,
               updated_at = NOW()
           WHERE id = $1 RETURNING *`,
            [offerId, status],
          );
        }

        await client.query(
          `INSERT INTO competition_admin_audit (
           competition_id, actor_user_id, action_type, reason, before_data, after_data
         )
         VALUES ($1, $2, 'SPONSORED_REWARD_STATUS_CHANGED', $3, $4::jsonb, $5::jsonb)`,
          [
            competitionId, userId, reason,
            JSON.stringify({ status: old.status }),
            JSON.stringify({
              offerId,
              status: saved.rows[0].status,
              unclaimedQuantity: saved.rows[0].unclaimed_quantity,
              returnedQuantity: saved.rows[0].returned_quantity,
            }),
          ],
        );

        await client.query('COMMIT');
        inTransaction = false;
        return res.json({ offer: saved.rows[0] });
      } catch (error) {
        if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
        console.error('Failed to change sponsored reward offer status:', error);
        return res.status(500).json({ error: 'Failed to update sponsored reward offer' });
      } finally {
        client.release();
      }
    },
  );

  router.get(
    '/api/competitions/:competitionId/admin/reward-offers',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { competitionId } = req.params;

        await processExpiredSponsoredRewards(competitionId);

        const owner = await query(
          `SELECT id FROM competitions
         WHERE id = $1 AND creator_id = $2`,
          [competitionId, userId],
        );

        if (!owner.rows.length) {
          return res.status(404).json({ error: 'Challenge not found' });
        }

        const offers = await query(
          `SELECT
           o.*,
           COALESCE(claim_counts.claimed_count, 0)::int AS claimed_count,
           GREATEST(o.quantity - COALESCE(claim_counts.claimed_count, 0), 0)::int
             AS remaining_quantity
         FROM competition_reward_offers o
         LEFT JOIN (
           SELECT offer_id, COUNT(*)::int AS claimed_count
           FROM competition_reward_claims
           WHERE status IN ('CLAIMED', 'APPROVED', 'FULFILLED')
           GROUP BY offer_id
         ) claim_counts ON claim_counts.offer_id = o.id
         WHERE o.competition_id = $1
         ORDER BY o.created_at DESC`,
          [competitionId],
        );

        const claims = await query(
          `SELECT
           cl.id,
           cl.offer_id,
           o.reward_name,
           o.sponsor_name,
           cl.user_id,
           u.username,
           u.display_name,
           cl.status,
           cl.claimed_at,
           cl.updated_at
         FROM competition_reward_claims cl
         JOIN competition_reward_offers o ON o.id = cl.offer_id
         JOIN users u ON u.id = cl.user_id
         WHERE o.competition_id = $1
         ORDER BY cl.claimed_at DESC`,
          [competitionId],
        );

        return res.json({
          offers: offers.rows,
          claims: claims.rows,
        });
      } catch (error) {
        console.error('Failed to load sponsored reward offers:', error);
        return res.status(500).json({ error: 'Failed to load sponsored reward offers' });
      }
    },
  );

  router.get(
    '/api/competitions/:competitionId/reward-offers',
    requireAuth,
    async (req, res) => {
      try {
        const userId = res.locals.authenticatedUserId as string;
        const { competitionId } = req.params;

        await processExpiredSponsoredRewards(competitionId);

        const membership = await query(
          `SELECT 1 FROM competition_participants
         WHERE competition_id = $1 AND user_id = $2`,
          [competitionId, userId],
        );

        if (!membership.rows.length) {
          return res.status(403).json({ error: 'Join the challenge to view its reward offers' });
        }

        const competition = await query(
          `SELECT status FROM competitions WHERE id = $1`,
          [competitionId],
        );

        if (!competition.rows.length) {
          return res.status(404).json({ error: 'Challenge not found' });
        }

        if (competition.rows[0].status !== 'COMPLETED') {
          return res.json({ offers: [] });
        }

        const result = await query(
          `SELECT
           o.id,
           o.sponsor_name,
           o.reward_name,
           o.description,
           o.quantity,
           o.eligibility_type,
           o.claim_deadline,
           o.unclaimed_policy,
           o.status,
           COALESCE(claim_counts.claimed_count, 0)::int AS claimed_count,
           GREATEST(o.quantity - COALESCE(claim_counts.claimed_count, 0), 0)::int
             AS remaining_quantity,
           mine.status AS my_claim_status,
           mine.claimed_at,
           cr.rank_position,
           CASE
             WHEN o.eligibility_type = 'ALL_PARTICIPANTS' THEN TRUE
             WHEN o.eligibility_type = 'TOP_3' THEN cr.rank_position BETWEEN 1 AND 3
             WHEN o.eligibility_type = 'RANK_1' THEN cr.rank_position = 1
             WHEN o.eligibility_type = 'RANK_2' THEN cr.rank_position = 2
             WHEN o.eligibility_type = 'RANK_3' THEN cr.rank_position = 3
             ELSE FALSE
           END AS eligible
         FROM competition_reward_offers o
         LEFT JOIN competition_results cr
           ON cr.competition_id = o.competition_id
          AND cr.user_id = $2
         LEFT JOIN competition_reward_claims mine
           ON mine.offer_id = o.id AND mine.user_id = $2
         LEFT JOIN (
           SELECT offer_id, COUNT(*)::int AS claimed_count
           FROM competition_reward_claims
           WHERE status IN ('CLAIMED', 'APPROVED', 'FULFILLED')
           GROUP BY offer_id
         ) claim_counts ON claim_counts.offer_id = o.id
         WHERE o.competition_id = $1
           AND o.status = 'ACTIVE'
         ORDER BY o.created_at DESC`,
          [competitionId, userId],
        );

        return res.json({ offers: result.rows });
      } catch (error) {
        console.error('Failed to load participant reward offers:', error);
        return res.status(500).json({ error: 'Failed to load reward offers' });
      }
    },
  );

  router.post(
    '/api/competitions/:competitionId/reward-offers/:offerId/claim',
    requireAuth,
    async (req, res) => {
      const client = await pool.connect();
      let inTransaction = false;

      try {
        const userId = res.locals.authenticatedUserId as string;
        const { competitionId, offerId } = req.params;

        await processExpiredSponsoredRewards(competitionId);

        await client.query('BEGIN');
        inTransaction = true;

        const offerResult = await client.query(
          `SELECT
           o.*,
           c.status AS competition_status
         FROM competition_reward_offers o
         JOIN competitions c ON c.id = o.competition_id
         WHERE o.id = $1 AND o.competition_id = $2
         FOR UPDATE OF o`,
          [offerId, competitionId],
        );

        if (!offerResult.rows.length) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(404).json({ error: 'Reward offer not found' });
        }

        const offer = offerResult.rows[0];

        if (offer.competition_status !== 'COMPLETED') {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'Challenge results are not finalized' });
        }

        if (offer.status !== 'ACTIVE') {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'This reward offer is not active' });
        }

        if (offer.claim_deadline && new Date(offer.claim_deadline).getTime() <= Date.now()) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'The reward claim deadline has passed' });
        }

        const participant = await client.query(
          `SELECT 1 FROM competition_participants
         WHERE competition_id = $1 AND user_id = $2`,
          [competitionId, userId],
        );

        if (!participant.rows.length) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(403).json({ error: 'You are not registered for this challenge' });
        }

        const result = await client.query(
          `SELECT rank_position FROM competition_results
         WHERE competition_id = $1 AND user_id = $2`,
          [competitionId, userId],
        );

        const rank = result.rows[0]?.rank_position ?? null;
        const eligible =
          offer.eligibility_type === 'ALL_PARTICIPANTS' ||
          (offer.eligibility_type === 'TOP_3' && rank !== null && rank <= 3) ||
          (offer.eligibility_type === 'RANK_1' && rank === 1) ||
          (offer.eligibility_type === 'RANK_2' && rank === 2) ||
          (offer.eligibility_type === 'RANK_3' && rank === 3);

        if (!eligible) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(403).json({ error: 'You are not eligible for this reward' });
        }

        const existing = await client.query(
          `SELECT id, status FROM competition_reward_claims
         WHERE offer_id = $1 AND user_id = $2
         FOR UPDATE`,
          [offerId, userId],
        );

        if (existing.rows.length) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({
            error: 'You have already claimed or processed this reward',
            claim: existing.rows[0],
          });
        }

        const capacity = await client.query(
          `SELECT COUNT(*)::int AS claimed_count
         FROM competition_reward_claims
         WHERE offer_id = $1
           AND status IN ('CLAIMED', 'APPROVED', 'FULFILLED')`,
          [offerId],
        );

        if (Number(capacity.rows[0]?.claimed_count ?? 0) >= Number(offer.quantity)) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'All available reward units have been claimed' });
        }

        const saved = await client.query(
          `INSERT INTO competition_reward_claims (
           offer_id, competition_id, user_id, status
         )
         VALUES ($1, $2, $3, 'CLAIMED')
         RETURNING *`,
          [offerId, competitionId, userId],
        );

        await client.query(
          `INSERT INTO competition_admin_audit (
           competition_id, actor_user_id, target_user_id,
           action_type, reason, before_data, after_data
         )
         VALUES ($1, $2, $2, 'SPONSORED_REWARD_CLAIMED',
                 $3, '{}'::jsonb, $4::jsonb)`,
          [
            competitionId,
            userId,
            `Participant claimed sponsored reward: ${offer.reward_name}`,
            JSON.stringify({ offerId, claimId: saved.rows[0].id, rewardName: offer.reward_name }),
          ],
        );

        await client.query(
          `INSERT INTO notifications
           (user_id, type, title, message, competition_id, dedupe_key)
         SELECT c.creator_id, 'SPONSORED_REWARD_CLAIMED', $1, $2, $3, $4
         FROM competitions c
         WHERE c.id = $3
         ON CONFLICT (dedupe_key) DO NOTHING`,
          [
            'Sponsored reward claimed',
            `A participant claimed ${offer.reward_name}. Review the claim in challenge operations.`,
            competitionId,
            `reward-claimed:${saved.rows[0].id}`,
          ],
        );

        await client.query('COMMIT');
        inTransaction = false;
        return res.status(201).json({ claim: saved.rows[0] });
      } catch (error) {
        if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
        console.error('Failed to claim sponsored reward:', error);
        return res.status(500).json({ error: 'Failed to claim reward' });
      } finally {
        client.release();
      }
    },
  );

  router.put(
    '/api/competitions/:competitionId/admin/reward-claims/:claimId',
    requireAuth,
    async (req, res) => {
      const client = await pool.connect();
      let inTransaction = false;

      try {
        const userId = res.locals.authenticatedUserId as string;
        const { competitionId, claimId } = req.params;
        const status = String(req.body?.status ?? '').trim().toUpperCase();
        const reason = String(req.body?.reason ?? '').trim();

        const allowedStatuses = ['APPROVED', 'FULFILLED', 'CANCELLED'];

        if (!allowedStatuses.includes(status)) {
          return res.status(400).json({ error: 'Invalid claim status', allowedStatuses });
        }
        if (!reason || reason.length > 1000) {
          return res.status(400).json({ error: 'A reason (maximum 1000 characters) is required' });
        }

        await client.query('BEGIN');
        inTransaction = true;

        const owner = await client.query(
          `SELECT id FROM competitions
         WHERE id = $1 AND creator_id = $2
         FOR UPDATE`,
          [competitionId, userId],
        );

        if (!owner.rows.length) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(404).json({ error: 'Challenge not found' });
        }

        const previous = await client.query(
          `SELECT cl.*, o.reward_name
         FROM competition_reward_claims cl
         JOIN competition_reward_offers o ON o.id = cl.offer_id
         WHERE cl.id = $1 AND cl.competition_id = $2
         FOR UPDATE OF cl`,
          [claimId, competitionId],
        );

        if (!previous.rows.length) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(404).json({ error: 'Reward claim not found' });
        }

        if (previous.rows[0].status === 'CANCELLED' || previous.rows[0].status === 'EXPIRED') {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'This claim is already closed' });
        }

        if (
          previous.rows[0].status === 'FULFILLED' &&
          status !== 'FULFILLED'
        ) {
          await client.query('ROLLBACK');
          inTransaction = false;
          return res.status(409).json({ error: 'A fulfilled reward cannot be changed' });
        }

        const saved = await client.query(
          `UPDATE competition_reward_claims
         SET status = $2, updated_by = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
          [claimId, status, userId],
        );

        await client.query(
          `INSERT INTO competition_admin_audit (
           competition_id, actor_user_id, target_user_id,
           action_type, reason, before_data, after_data
         )
         VALUES ($1, $2, $3, 'SPONSORED_REWARD_CLAIM_UPDATED',
                 $4, $5::jsonb, $6::jsonb)`,
          [
            competitionId,
            userId,
            previous.rows[0].user_id,
            reason,
            JSON.stringify({ status: previous.rows[0].status }),
            JSON.stringify({
              claimId,
              offerId: previous.rows[0].offer_id,
              rewardName: previous.rows[0].reward_name,
              status,
            }),
          ],
        );

        await client.query(
          `INSERT INTO notifications
           (user_id, type, title, message, competition_id, dedupe_key)
         VALUES ($1, 'SPONSORED_REWARD_STATUS', $2, $3, $4, $5)
         ON CONFLICT (dedupe_key) DO NOTHING`,
          [
            previous.rows[0].user_id,
            'Sponsored reward claim updated',
            `${previous.rows[0].reward_name}: your claim status is now ${status}.`,
            competitionId,
            `reward-claim-status:${claimId}:${status}`,
          ],
        );

        await client.query('COMMIT');
        inTransaction = false;
        return res.json({ claim: saved.rows[0] });
      } catch (error) {
        if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
        console.error('Failed to update sponsored reward claim:', error);
        return res.status(500).json({ error: 'Failed to update reward claim' });
      } finally {
        client.release();
      }
    },
  );


  router.get(
    '/api/users/:userId/competition-badges',
    async (req, res) => {
      try {
        const { userId } = req.params;
        const result = await query(
          `SELECT
           ub.id,
           ub.badge_code AS code,
           bd.name,
           bd.description,
           bd.icon,
           ub.awarded_at,
           ub.competition_id,
           c.name AS competition_name,
           cr.rank_position,
           cr.score,
           cr.metric
         FROM user_competition_badges ub
         JOIN competition_badge_definitions bd ON bd.code = ub.badge_code
         JOIN competitions c ON c.id = ub.competition_id
         LEFT JOIN competition_results cr
           ON cr.competition_id = ub.competition_id
          AND cr.user_id = ub.user_id
         WHERE ub.user_id = $1
         ORDER BY ub.awarded_at DESC, bd.name ASC`,
          [userId],
        );
        return res.json({ badges: result.rows });
      } catch (error) {
        console.error('Failed to load competition badges:', error);
        return res.status(500).json({ error: 'Failed to load competition badges' });
      }
    },
  );

  app.use(router);
}

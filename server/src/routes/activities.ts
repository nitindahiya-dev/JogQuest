import { Router, type Express } from 'express';
import type { PoolClient } from 'pg';
import type { CreateActivityBody } from '../utils/activity.js';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerActivitiesRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { pool, query, requireAuth, validateActivityGps } = context;

router.get('/api/activities/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = res.locals.authenticatedUserId as string;

    if (userId !== authenticatedUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await query(
      `
      SELECT
        a.id,
        a.activity_type,
        a.distance_km,
        a.elapsed_seconds,
        a.pace,
        a.started_at,
        a.finished_at,
        a.created_at,

        t.id AS territory_id,
        t.area_m2 AS territory_area_m2,
        t.area_km2 AS territory_area_km2

      FROM activities a

      LEFT JOIN territories t
        ON t.activity_id = a.id

      WHERE a.user_id = $1

      ORDER BY a.created_at DESC
      `,
      [userId],
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to fetch activities',
    });
  }
});

router.get('/api/activities/:activityId/route', requireAuth, async (req, res) => {
  try {
    const { activityId } = req.params;

    const activityResult = await query(
      `
      SELECT
        id,
        user_id,
        activity_type,
        distance_km,
        elapsed_seconds,
        pace
      FROM activities
      WHERE id = $1
        AND user_id = $2
      `,
      [activityId, res.locals.authenticatedUserId],
    );

    if (activityResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Activity not found',
      });
    }

    const pointsResult = await query(
      `
      SELECT
        sequence_number,
        ST_Y(location::geometry) AS latitude,
        ST_X(location::geometry) AS longitude,
        recorded_at
      FROM activity_points
      WHERE activity_id = $1
      ORDER BY sequence_number ASC
      `,
      [activityId],
    );

    res.json({
      activity: activityResult.rows[0],
      route: pointsResult.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to fetch activity route',
    });
  }
});

router.post('/api/activities', requireAuth, async (req, res) => {
  let client: PoolClient | undefined;
  let transactionStarted = false;

  try {
    const body = req.body as CreateActivityBody;
    const authenticatedUserId = res.locals.authenticatedUserId as string;

    if (
      !Array.isArray(body.route) ||
      body.route.some(
        point =>
          !point ||
          !Number.isFinite(point.timestamp) ||
          (point.timestamp as number) <= 0,
      )
    ) {
      return res.status(400).json({
        error: 'Every recorded GPS point must have a valid timestamp',
      });
    }

    const validation = validateActivityGps(body);

    if (!validation.ok) {
      return res.status(validation.status).json(validation.body);
    }

    const serverDistanceKm = validation.serverDistanceKm;

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const activityResult = await client.query(
      `
      INSERT INTO activities (
        user_id,
        activity_type,
        distance_km,
        elapsed_seconds,
        pace,
        started_at,
        finished_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        created_at
      `,
      [
        authenticatedUserId,
        body.activityType,
        serverDistanceKm,
        body.elapsedSeconds,
        body.pace,
        body.startedAt ?? null,
        body.finishedAt ?? null,
      ],
    );

    const activity = activityResult.rows[0];

    for (
      let index = 0;
      index < body.route.length;
      index += 1
    ) {
      const point = body.route[index];

      await client.query(
        `
  INSERT INTO activity_points (
    activity_id,
    sequence_number,
    location,
    recorded_at
  )
  VALUES (
    $1,
    $2,
    ST_SetSRID(
      ST_MakePoint($3, $4),
      4326
    )::geography,
    to_timestamp($5::double precision / 1000.0)
  )
  `,
        [
          activity.id,
          index,
          point.longitude,
          point.latitude,
          point.timestamp,
        ],
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;

    res.status(201).json({
      ok: true,
      activity,
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to roll back activity transaction:', rollbackError);
      }
    }

    console.error(error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to save activity',
      });
    }
  } finally {
    client?.release();
  }
});

  app.use(router);
}

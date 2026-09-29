import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool, query } from './db.js';

const app = express();

app.use(cors());
app.use(express.json());

type Coordinate = {
  latitude: number;
  longitude: number;
};

type CreateActivityBody = {
  userId: string;
  activityType: 'Run' | 'Walk' | 'Cycle';
  distanceKm: number;
  elapsedSeconds: number;
  pace: string;
  startedAt?: string;
  finishedAt?: string;
  route: Coordinate[];
  territory?: {
    areaM2: number;
    areaKm2: number;
    polygon: Coordinate[];
  };
};

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get('/api/health', async (_req, res) => {
  try {
    const result = await query<{ now: string }>(
      'SELECT NOW() AS now',
    );

    res.json({
      ok: true,
      service: 'JogQuest API',
      database: 'connected',
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      service: 'JogQuest API',
      database: 'disconnected',
    });
  }
});

// --------------------------------------------------
// CREATE USER
// --------------------------------------------------

app.post('/api/users', async (req, res) => {
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

// --------------------------------------------------
// GET USER PROFILE
// --------------------------------------------------

app.get('/api/users/:userId/profile', async (req, res) => {
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
        WHERE action = 'DEFENDED'
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

// --------------------------------------------------
// GET USER ACTIVITIES
// --------------------------------------------------


app.get('/api/activities/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

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

// --------------------------------------------------
// GET TERRITORIES
// --------------------------------------------------

app.get('/api/territories', async (_req, res) => {
  try {
    const result = await query(
      `
      SELECT
        id,
        user_id,
        activity_id,
        activity_type,
        area_m2,
        area_km2,
        ST_AsGeoJSON(
          polygon::geometry
        )::json AS polygon,
        captured_at
      FROM territories
      ORDER BY captured_at DESC
      `,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to fetch territories',
    });
  }
});

// --------------------------------------------------
// CREATE ACTIVITY
// --------------------------------------------------

app.post('/api/activities', async (req, res) => {
  const client = await pool.connect();

  try {
    const body = req.body as CreateActivityBody;

    if (
      !body.userId ||
      !body.activityType ||
      typeof body.distanceKm !== 'number' ||
      typeof body.elapsedSeconds !== 'number' ||
      !Array.isArray(body.route)
    ) {
      return res.status(400).json({
        error: 'Invalid activity data',
      });
    }

    if (body.route.length === 0) {
      return res.status(400).json({
        error: 'Route must contain at least one point',
      });
    }

    await client.query('BEGIN');

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
        body.userId,
        body.activityType,
        body.distanceKm,
        body.elapsedSeconds,
        body.pace,
        body.startedAt ?? null,
        body.finishedAt ?? null,
      ],
    );

    const activity = activityResult.rows[0];

    // Save every GPS point.
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
          location
        )
        VALUES (
          $1,
          $2,
          ST_SetSRID(
            ST_MakePoint($3, $4),
            4326
          )::geography
        )
        `,
        [
          activity.id,
          index,
          point.longitude,
          point.latitude,
        ],
      );
    }

    let territory = null;

    // Save territory when one was captured.
    if (
      body.territory &&
      Array.isArray(body.territory.polygon) &&
      body.territory.polygon.length >= 4
    ) {
      const polygonCoordinates =
        body.territory.polygon
          .map(
            point =>
              `${point.longitude} ${point.latitude}`,
          )
          .join(',');

      const polygonWkt =
        `POLYGON((${polygonCoordinates}))`;

      const territoryResult =
        await client.query(
          `
          INSERT INTO territories (
            user_id,
            activity_id,
            activity_type,
            area_m2,
            area_km2,
            polygon
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            ST_GeomFromText(
              $6,
              4326
            )::geography
          )
          RETURNING
            id,
            area_m2,
            area_km2,
            captured_at
          `,
          [
            body.userId,
            activity.id,
            body.activityType,
            body.territory.areaM2,
            body.territory.areaKm2,
            polygonWkt,
          ],
        );

      territory = territoryResult.rows[0];

      await client.query(
        `
        INSERT INTO territory_history (
          territory_id,
          previous_owner_id,
          new_owner_id,
          action
        )
        VALUES (
          $1,
          NULL,
          $2,
          'CAPTURED'
        )
        `,
        [
          territory.id,
          body.userId,
        ],
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      ok: true,
      activity,
      territory,
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error(error);

    res.status(500).json({
      error: 'Failed to save activity',
    });
  } finally {
    client.release();
  }
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

const PORT =
  Number(process.env.PORT) || 4000;

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `JogQuest API running on http://localhost:${PORT}`,
    );
  },
);

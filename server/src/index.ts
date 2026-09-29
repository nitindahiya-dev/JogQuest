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
// GET LEADERBOARD
// --------------------------------------------------

app.get('/api/leaderboard', async (_req, res) => {
  try {
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
      )
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY
            COALESCE(t.territory_km2, 0) DESC,
            COALESCE(a.total_distance_km, 0) DESC,
            u.created_at ASC
        )::int AS rank,

        u.id,
        u.username,
        u.display_name,
        u.avatar_url,

        COALESCE(
          t.territory_km2,
          0
        )::double precision AS territory_km2,

        COALESCE(
          t.territories_captured,
          0
        )::int AS territories_captured,

        COALESCE(
          a.activities_count,
          0
        )::int AS activities_count,

        COALESCE(
          a.total_distance_km,
          0
        )::double precision AS total_distance_km

      FROM users u

      LEFT JOIN activity_stats a
        ON a.user_id = u.id

      LEFT JOIN territory_stats t
        ON t.user_id = u.id

      ORDER BY
        rank ASC
      `,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to fetch leaderboard',
    });
  }
});

// --------------------------------------------------
// CHECK TERRITORY OVERLAP
// --------------------------------------------------

app.post('/api/territories/check-overlap', async (req, res) => {
  try {
    const { polygon } = req.body;

    if (!Array.isArray(polygon) || polygon.length < 4) {
      return res.status(400).json({
        error: 'Polygon must contain at least 4 points',
      });
    }

    const coordinates = polygon.map(
      (point: Coordinate) =>
        `${point.longitude} ${point.latitude}`,
    );

    const first = polygon[0];
    const last = polygon[polygon.length - 1];

    if (
      first.latitude !== last.latitude ||
      first.longitude !== last.longitude
    ) {
      return res.status(400).json({
        error: 'Polygon must be closed',
      });
    }

    const polygonWkt =
      `SRID=4326;POLYGON((${coordinates.join(',')}))`;

    const result = await query(
      `
      WITH claim AS (
        SELECT
          ST_GeogFromText($1) AS polygon
      )
      SELECT
        t.id,
        t.user_id,
        u.username,
        u.display_name,
        t.area_m2,
        t.area_km2,
        ST_Area(
          ST_Intersection(
            t.polygon,
            claim.polygon
          )
        ) AS intersection_area_m2
      FROM territories t
      JOIN users u
        ON u.id = t.user_id
      CROSS JOIN claim
      WHERE ST_Intersects(
        t.polygon,
        claim.polygon
      )
      ORDER BY intersection_area_m2 DESC
      `,
      [polygonWkt],
    );

    res.json({
      hasOverlap: result.rows.length > 0,
      conflicts: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to check territory overlap',
    });
  }
});

// --------------------------------------------------
// CLAIM TERRITORY
// --------------------------------------------------

app.post('/api/territories/claim', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      userId,
      activityId,
      activityType,
      polygon,
    } = req.body;

    if (
      !userId ||
      !activityId ||
      !activityType ||
      !Array.isArray(polygon) ||
      polygon.length < 4
    ) {
      return res.status(400).json({
        error: 'userId, activityId, activityType and polygon are required',
      });
    }

    if (
      !['Run', 'Walk', 'Cycle'].includes(activityType)
    ) {
      return res.status(400).json({
        error: 'Invalid activity type',
      });
    }

    const first = polygon[0];
    const last = polygon[polygon.length - 1];

    if (
      first.latitude !== last.latitude ||
      first.longitude !== last.longitude
    ) {
      return res.status(400).json({
        error: 'Polygon must be closed',
      });
    }

    const coordinates = polygon.map(
      (point: Coordinate) =>
        `${point.longitude} ${point.latitude}`,
    );

    const polygonWkt =
      `SRID=4326;POLYGON((${coordinates.join(',')}))`;

    await client.query('BEGIN');

    // Make sure the user exists.
    const userResult = await client.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      `,
      [userId],
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'User not found',
      });
    }

    // Make sure the activity exists and belongs to the user.
    const activityResult = await client.query(
      `
      SELECT id
      FROM activities
      WHERE id = $1
        AND user_id = $2
      `,
      [activityId, userId],
    );

    if (activityResult.rows.length === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Activity not found for this user',
      });
    }

    // Calculate the actual polygon area with PostGIS.
    const areaResult = await client.query<{
      area_m2: number;
    }>(
      `
      SELECT
        ST_Area(
          ST_GeogFromText($1)
        ) AS area_m2
      `,
      [polygonWkt],
    );

    const areaM2 =
      Number(areaResult.rows[0].area_m2);

    const areaKm2 =
      areaM2 / 1_000_000;

    if (areaM2 < 1000) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        error: 'Territory is too small',
        areaM2,
        areaKm2,
      });
    }

    // Find existing territories that intersect the claim.
    const conflictsResult = await client.query(
      `
      WITH claim AS (
        SELECT
          ST_GeogFromText($1) AS polygon
      )
      SELECT
        t.id,
        t.user_id,
        u.username,
        u.display_name,
        t.area_m2,
        t.area_km2,
        ST_Area(
          ST_Intersection(
            t.polygon,
            claim.polygon
          )
        ) AS intersection_area_m2
      FROM territories t
      JOIN users u
        ON u.id = t.user_id
      CROSS JOIN claim
      WHERE ST_Intersects(
        t.polygon,
        claim.polygon
      )
      ORDER BY intersection_area_m2 DESC
      `,
      [polygonWkt],
    );

    if (conflictsResult.rows.length > 0) {
      await client.query('ROLLBACK');

      return res.status(409).json({
        error: 'Territory overlaps existing territory',
        areaM2,
        areaKm2,
        conflicts: conflictsResult.rows,
      });
    }

    // Create the new territory.
    const territoryResult = await client.query(
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
        ST_GeogFromText($6)
      )
      RETURNING
        id,
        user_id,
        activity_id,
        activity_type,
        area_m2,
        area_km2,
        captured_at
      `,
      [
        userId,
        activityId,
        activityType,
        areaM2,
        areaKm2,
        polygonWkt,
      ],
    );

    const territory =
      territoryResult.rows[0];

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
      [territory.id, userId],
    );

    await client.query('COMMIT');

    res.status(201).json({
      ok: true,
      territory,
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error(error);

    res.status(500).json({
      error: 'Failed to claim territory',
    });
  } finally {
    client.release();
  }
});

// --------------------------------------------------
// GET TERRITORY DETAILS
// --------------------------------------------------

app.get('/api/territories/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT
        t.id,
        t.user_id,
        t.activity_id,
        t.activity_type,
        t.area_m2,
        t.area_km2,
        t.captured_at,

        u.username AS owner_username,
        u.display_name AS owner_display_name,

        a.distance_km,
        a.elapsed_seconds,
        a.pace,

        (
          SELECT th.action
          FROM territory_history th
          WHERE th.territory_id = t.id
          ORDER BY th.created_at DESC
          LIMIT 1
        ) AS latest_action

      FROM territories t

      JOIN users u
        ON u.id = t.user_id

      LEFT JOIN activities a
        ON a.id = t.activity_id

      WHERE t.id = $1
      `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Territory not found',
      });
    }

    const territory = result.rows[0];

    res.json({
      ...territory,
      status:
        territory.latest_action === 'CAPTURED'
          ? 'Protected'
          : territory.latest_action ?? 'Unknown',
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to fetch territory details',
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

    await client.query('COMMIT');

    res.status(201).json({
      ok: true,
      activity,
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

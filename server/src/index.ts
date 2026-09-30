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
        [
          'CAPTURED',
          'TRANSFERRED',
          'CHALLENGE_REJECTED',
        ].includes(territory.latest_action)
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
// GET TERRITORY HISTORY
// --------------------------------------------------

app.get('/api/territories/:id/history', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT
        th.id,
        th.territory_id,
        th.action,

        th.previous_owner_id,
        previous_owner.username AS previous_owner_username,
        previous_owner.display_name AS previous_owner_display_name,

        th.new_owner_id,
        new_owner.username AS new_owner_username,
        new_owner.display_name AS new_owner_display_name,

        th.created_at

      FROM territory_history th

      LEFT JOIN users previous_owner
        ON previous_owner.id = th.previous_owner_id

      LEFT JOIN users new_owner
        ON new_owner.id = th.new_owner_id

      WHERE th.territory_id = $1

      ORDER BY th.created_at ASC
      `,
      [id],
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to fetch territory history',
    });
  }
});

// --------------------------------------------------
// CREATE TERRITORY CHALLENGE
// --------------------------------------------------

app.post('/api/territories/:id/challenges', async (req, res) => {
  try {
    const { id: territoryId } = req.params;
    const {
      challengerId,
      activityId,
      polygon,
    } = req.body;

    if (
      !challengerId ||
      !activityId ||
      !Array.isArray(polygon) ||
      polygon.length < 4
    ) {
      return res.status(400).json({
        error: 'challengerId, activityId and polygon are required',
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

    const result = await query(
      `
      WITH target AS (
        SELECT
          t.id,
          t.user_id,
          t.area_m2,
          t.area_km2,
          t.polygon
        FROM territories t
        WHERE t.id = $1
      ),
      claim AS (
        SELECT
          ST_GeogFromText($2) AS polygon
      )
      SELECT
        target.id,
        target.user_id,
        target.area_m2,
        target.area_km2,
        ST_Intersects(
          target.polygon,
          claim.polygon
        ) AS intersects,
        ST_Area(
          ST_Intersection(
            target.polygon,
            claim.polygon
          )
        ) AS overlap_area_m2
      FROM target
      CROSS JOIN claim
      `,
      [territoryId, polygonWkt],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Territory not found',
      });
    }

    const territory = result.rows[0];

    if (!territory.intersects) {
      return res.status(409).json({
        error: 'Challenge polygon does not overlap territory',
      });
    }

    const ownerId = territory.user_id;

    if (ownerId === challengerId) {
      return res.status(409).json({
        error: 'You already own this territory',
      });
    }

    const activityResult = await query(
      `
      SELECT id
      FROM activities
      WHERE id = $1
        AND user_id = $2
      `,
      [activityId, challengerId],
    );

    if (activityResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Activity not found for challenger',
      });
    }

    const challengerResult = await query(
      `
      SELECT
        id,
        username,
        display_name
      FROM users
      WHERE id = $1
      `,
      [challengerId],
    );

    if (challengerResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Challenger not found',
      });
    }

    const overlapAreaM2 =
      Number(territory.overlap_area_m2);

    const overlapRatio =
      territory.area_m2 > 0
        ? overlapAreaM2 /
          Number(territory.area_m2)
        : 0;

    const insertResult = await query(
      `
      INSERT INTO territory_challenges (
        territory_id,
        activity_id,
        challenger_id,
        overlap_area_m2,
        overlap_ratio,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'PENDING'
      )
      RETURNING
        id,
        territory_id,
        activity_id,
        challenger_id,
        overlap_area_m2,
        overlap_ratio,
        status,
        created_at
      `,
      [
        territoryId,
        activityId,
        challengerId,
        overlapAreaM2,
        overlapRatio,
      ],
    );

    res.status(201).json({
      ok: true,
      challenge: insertResult.rows[0],
      owner: {
        id: ownerId,
      },
      challenger: challengerResult.rows[0],
    });
  } catch (error: any) {
    console.error(error);

    if (error?.code === '23505') {
      return res.status(409).json({
        error: 'A challenge already exists for this activity and territory',
      });
    }

    res.status(500).json({
      error: 'Failed to create territory challenge',
    });
  }
});

// --------------------------------------------------
// RESOLVE TERRITORY CHALLENGE
// --------------------------------------------------

app.post(
  '/api/territories/:id/challenges/:challengeId/resolve',
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        id: territoryId,
        challengeId,
      } = req.params;

      const {
        resolverId,
        decision,
      } = req.body;

      if (
        !resolverId ||
        !['ACCEPT', 'REJECT'].includes(decision)
      ) {
        return res.status(400).json({
          error: 'resolverId and decision are required',
        });
      }

      await client.query('BEGIN');

      // Lock the territory so two resolutions cannot
      // modify ownership at the same time.
      const territoryResult =
        await client.query(
          `
          SELECT
            id,
            user_id
          FROM territories
          WHERE id = $1
          FOR UPDATE
          `,
          [territoryId],
        );

      if (
        territoryResult.rows.length === 0
      ) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          error: 'Territory not found',
        });
      }

      const territory =
        territoryResult.rows[0];

      // Only the current owner can resolve
      // the challenge.
      if (
        territory.user_id !== resolverId
      ) {
        await client.query('ROLLBACK');

        return res.status(403).json({
          error:
            'Only the current territory owner can resolve this challenge',
        });
      }

      const challengeResult =
        await client.query(
          `
          SELECT
            tc.id,
            tc.territory_id,
            tc.challenger_id,
            tc.status,

            u.username AS challenger_username,
            u.display_name AS challenger_display_name

          FROM territory_challenges tc

          JOIN users u
            ON u.id = tc.challenger_id

          WHERE tc.id = $1
            AND tc.territory_id = $2
          FOR UPDATE
          `,
          [challengeId, territoryId],
        );

      if (
        challengeResult.rows.length === 0
      ) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          error: 'Challenge not found',
        });
      }

      const challenge =
        challengeResult.rows[0];

      if (
        challenge.status !== 'PENDING'
      ) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          error: `Challenge is already ${challenge.status}`,
        });
      }

      const now = new Date();

      if (decision === 'REJECT') {
        const rejectedResult =
          await client.query(
            `
            UPDATE territory_challenges
            SET
              status = 'REJECTED',
              resolved_at = $1
            WHERE id = $2
            RETURNING
              id,
              territory_id,
              activity_id,
              challenger_id,
              overlap_area_m2,
              overlap_ratio,
              status,
              created_at,
              resolved_at
            `,
            [now, challengeId],
          );

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
            $2,
            $2,
            'CHALLENGE_REJECTED'
          )
          `,
          [
            territoryId,
            resolverId,
          ],
        );

        await client.query('COMMIT');

        return res.json({
          ok: true,
          decision: 'REJECTED',
          challenge:
            rejectedResult.rows[0],
          owner: {
            id: resolverId,
          },
        });
      }

      const newOwnerId =
        challenge.challenger_id;

      // Transfer ownership.
      const updatedTerritory =
        await client.query(
          `
          UPDATE territories
          SET user_id = $1
          WHERE id = $2
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
            newOwnerId,
            territoryId,
          ],
        );

      const acceptedResult =
        await client.query(
          `
          UPDATE territory_challenges
          SET
            status = 'ACCEPTED',
            resolved_at = $1
          WHERE id = $2
          RETURNING
            id,
            territory_id,
            activity_id,
            challenger_id,
            overlap_area_m2,
            overlap_ratio,
            status,
            created_at,
            resolved_at
          `,
          [now, challengeId],
        );

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
          $2,
          $3,
          'TRANSFERRED'
        )
        `,
        [
          territoryId,
          resolverId,
          newOwnerId,
        ],
      );

      await client.query('COMMIT');

      res.json({
        ok: true,
        decision: 'ACCEPTED',
        challenge:
          acceptedResult.rows[0],
        territory:
          updatedTerritory.rows[0],
        previousOwner: {
          id: resolverId,
        },
        newOwner: {
          id: newOwnerId,
          username:
            challenge.challenger_username,
          displayName:
            challenge.challenger_display_name,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');

      console.error(error);

      res.status(500).json({
        error:
          'Failed to resolve territory challenge',
      });
    } finally {
      client.release();
    }
  },
);

// --------------------------------------------------
// GET TERRITORY CHALLENGES
// --------------------------------------------------


app.get('/api/territories/:id/challenges', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT
        tc.id,
        tc.territory_id,
        tc.activity_id,
        tc.challenger_id,
        tc.overlap_area_m2,
        tc.overlap_ratio,
        tc.status,
        tc.created_at,
        tc.resolved_at,

        u.username AS challenger_username,
        u.display_name AS challenger_display_name

      FROM territory_challenges tc

      JOIN users u
        ON u.id = tc.challenger_id

      WHERE tc.territory_id = $1

      ORDER BY tc.created_at DESC
      `,
      [id],
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to fetch territory challenges',
    });
  }
});

// --------------------------------------------------
// GET ACTIVITY ROUTE
// --------------------------------------------------

app.get('/api/activities/:activityId/route', async (req, res) => {
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
      `,
      [activityId],
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
// GET USER NOTIFICATIONS
// --------------------------------------------------

app.get('/api/users/:userId/notifications', async (req, res) => {
  try {
    const { userId } = req.params;

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
});


// --------------------------------------------------
// MARK NOTIFICATION AS READ
// --------------------------------------------------

app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `
      UPDATE notifications
      SET read_at = COALESCE(read_at, NOW())
      WHERE id = $1
      RETURNING
        id,
        read_at
      `,
      [id],
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
});


// --------------------------------------------------
// MARK ALL NOTIFICATIONS AS READ
// --------------------------------------------------

app.patch(
  '/api/users/:userId/notifications/read-all',
  async (req, res) => {
    try {
      const { userId } = req.params;

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


// ==================================================
// SOCIAL FEED
// ==================================================

// --------------------------------------------------
// GET FEED
// --------------------------------------------------

app.get('/api/feed/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

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


// --------------------------------------------------
// CREATE POST
// --------------------------------------------------

app.post('/api/posts', async (req, res) => {
  try {
    const {
      userId,
      content,
      activityId,
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
      });
    }

    const cleanContent =
      typeof content === 'string'
        ? content.trim()
        : '';

    if (!cleanContent && !activityId) {
      return res.status(400).json({
        error:
          'content or activityId is required',
      });
    }

    if (cleanContent.length > 500) {
      return res.status(400).json({
        error:
          'Post content cannot exceed 500 characters',
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

    if (activityId) {
      const activityResult = await query(
        `
        SELECT id
        FROM activities
        WHERE id = $1
          AND user_id = $2
        `,
        [activityId, userId],
      );

      if (activityResult.rows.length === 0) {
        return res.status(400).json({
          error:
            'Activity does not belong to this user',
        });
      }
    }

    const result = await query(
      `
      INSERT INTO posts (
        user_id,
        activity_id,
        content
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        user_id,
        activity_id,
        content,
        created_at
      `,
      [
        userId,
        activityId ?? null,
        cleanContent,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to create post',
    });
  }
});


// --------------------------------------------------
// FOLLOW USER
// --------------------------------------------------

app.post('/api/users/:userId/follow/:targetUserId', async (
  req,
  res,
) => {
  try {
    const {
      userId,
      targetUserId,
    } = req.params;

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


// --------------------------------------------------
// UNFOLLOW USER
// --------------------------------------------------

app.delete(
  '/api/users/:userId/follow/:targetUserId',
  async (req, res) => {
    try {
      const {
        userId,
        targetUserId,
      } = req.params;

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


// --------------------------------------------------
// FOLLOWING STATUS
// --------------------------------------------------

app.get(
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


// --------------------------------------------------
// LIKE POST
// --------------------------------------------------

app.post(
  '/api/posts/:postId/like/:userId',
  async (req, res) => {
    try {
      const {
        postId,
        userId,
      } = req.params;

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


// --------------------------------------------------
// UNLIKE POST
// --------------------------------------------------

app.delete(
  '/api/posts/:postId/like/:userId',
  async (req, res) => {
    try {
      const {
        postId,
        userId,
      } = req.params;

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


// --------------------------------------------------
// GET COMMENTS
// --------------------------------------------------

app.get(
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


// --------------------------------------------------
// CREATE COMMENT
// --------------------------------------------------

app.post(
  '/api/posts/:postId/comments',
  async (req, res) => {
    try {
      const { postId } = req.params;

      const {
        userId,
        comment,
      } = req.body;

      const cleanComment =
        typeof comment === 'string'
          ? comment.trim()
          : '';

      if (!userId || !cleanComment) {
        return res.status(400).json({
          error:
            'userId and comment are required',
        });
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


// ==================================================
// PUBLIC SOCIAL PROFILE
// ==================================================

app.get(
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


// ==================================================
// GET FOLLOWERS
// ==================================================

app.get(
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


// ==================================================
// GET FOLLOWING
// ==================================================

app.get(
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


// ==================================================
// CLUBS
// ==================================================

// --------------------------------------------------
// GET CLUBS
// --------------------------------------------------

app.get('/api/clubs', async (_req, res) => {
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


// --------------------------------------------------
// GET USER CLUBS
// --------------------------------------------------

app.get(
  '/api/users/:userId/clubs',
  async (req, res) => {
    try {
      const { userId } = req.params;

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
        error: 'Failed to fetch user clubs',
      });
    }
  },
);


// --------------------------------------------------
// CREATE CLUB
// --------------------------------------------------

app.post('/api/clubs', async (req, res) => {
  try {
    const {
      userId,
      name,
      description,
    } = req.body;

    const cleanName =
      typeof name === 'string'
        ? name.trim()
        : '';

    const cleanDescription =
      typeof description === 'string'
        ? description.trim()
        : '';

    if (!userId || !cleanName) {
      return res.status(400).json({
        error:
          'userId and name are required',
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
        creator_id
      )
      VALUES ($1, $2, $3)
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


// --------------------------------------------------
// GET CLUB DETAILS
// --------------------------------------------------

app.get(
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


// --------------------------------------------------
// GET CLUB MEMBERS
// --------------------------------------------------

app.get(
  '/api/clubs/:clubId/members',
  async (req, res) => {
    try {
      const {
        clubId,
      } = req.params;

      const result = await query(
        `
        SELECT
          u.id,
          u.username,
          u.display_name,
          u.avatar_url,
          cm.joined_at

        FROM club_members cm

        JOIN users u
          ON u.id = cm.user_id

        WHERE cm.club_id = $1

        ORDER BY
          cm.joined_at ASC
        `,
        [clubId],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch club members',
      });
    }
  },
);


// --------------------------------------------------
// JOIN CLUB
// --------------------------------------------------

app.post(
  '/api/clubs/:clubId/join/:userId',
  async (req, res) => {
    try {
      const {
        clubId,
        userId,
      } = req.params;

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


// --------------------------------------------------
// LEAVE CLUB
// --------------------------------------------------

app.delete(
  '/api/clubs/:clubId/join/:userId',
  async (req, res) => {
    try {
      const {
        clubId,
        userId,
      } = req.params;

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


// --------------------------------------------------
// CLUB MEMBERSHIP STATUS
// --------------------------------------------------

app.get(
  '/api/clubs/:clubId/membership/:userId',
  async (req, res) => {
    try {
      const {
        clubId,
        userId,
      } = req.params;

      const result = await query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM club_members
          WHERE club_id = $1
            AND user_id = $2
        ) AS joined
        `,
        [
          clubId,
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
          'Failed to fetch membership status',
      });
    }
  },
);


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

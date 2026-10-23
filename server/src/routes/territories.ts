import { Router, type Express } from 'express';
import type { Coordinate } from '../utils/geo.js';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerTerritoriesRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { distanceBetweenCoordinates, pool, query, requireAuth, validateActivityGps } = context;

router.post('/api/territories/check-overlap', async (req, res) => {
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

router.post('/api/territories/claim', requireAuth, async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const userId = res.locals.authenticatedUserId as string;
    const { activityId } = req.body;

    if (typeof activityId !== 'string' || !activityId.trim()) {
      res.status(400).json({ error: 'activityId is required' });
      return;
    }

    await client.query('BEGIN');
    transactionStarted = true;

    // Only use GPS points saved for this authenticated user's activity.
const routeResult = await client.query<{
  activity_type: 'Run' | 'Walk' | 'Cycle';
  elapsed_seconds: number | string;
  distance_km: number | string;
  latitude: number;
  longitude: number;
  timestamp: number | string;
  provider: string | null;
}>(
  `
  SELECT
    a.activity_type,
    a.elapsed_seconds,
    a.distance_km,
    a.source_provider AS provider,
    ST_Y(ap.location::geometry) AS latitude,
    ST_X(ap.location::geometry) AS longitude,
    EXTRACT(EPOCH FROM ap.recorded_at) * 1000 AS timestamp
  FROM activities a
  JOIN activity_points ap ON ap.activity_id = a.id
  WHERE a.id = $1 AND a.user_id = $2
  ORDER BY ap.sequence_number ASC
  `,
  [activityId, userId],
);

if (routeResult.rows.length === 0) {
  await client.query('ROLLBACK');
  transactionStarted = false;

  res.status(404).json({
    error: 'Activity not found or does not belong to this user',
  });
  return;
}

if (routeResult.rows[0].provider) {
  await client.query('ROLLBACK');
  transactionStarted = false;

  res.status(422).json({
    error: 'Imported activities cannot be used to claim territory',
  });
  return;
}

const route = routeResult.rows.map(point => ({
  latitude: Number(point.latitude),
  longitude: Number(point.longitude),
  timestamp: Number(point.timestamp),
}));
const activityType = routeResult.rows[0].activity_type;
const elapsedSeconds = Number(routeResult.rows[0].elapsed_seconds);
const reportedDistanceKm = Number(routeResult.rows[0].distance_km);

if (
  !Number.isFinite(elapsedSeconds) ||
  elapsedSeconds <= 0 ||
  !Number.isFinite(reportedDistanceKm) ||
  reportedDistanceKm <= 0
) {
  await client.query('ROLLBACK');
  transactionStarted = false;
  res.status(422).json({
    error: 'Activity has invalid duration or distance',
  });
  return;
}

const savedActivityValidation = validateActivityGps({
  activityType,
  elapsedSeconds,
  distanceKm: reportedDistanceKm,
  route,
});

if (!savedActivityValidation.ok) {
  await client.query('ROLLBACK');
  transactionStarted = false;

  res.status(422).json({
    error: 'Activity failed GPS integrity checks',
    reason: savedActivityValidation.body.error,
  });
  return;
}

let serverDistanceKm = 0;


    for (let index = 1; index < route.length; index += 1) {
      const segmentDistanceKm = distanceBetweenCoordinates(
        route[index - 1],
        route[index],
      );

      if (!Number.isFinite(segmentDistanceKm) || segmentDistanceKm > 0.5) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        res.status(422).json({
          error: 'Activity route contains an invalid GPS jump',
          segmentIndex: index,
        });
        return;
      }

      serverDistanceKm += segmentDistanceKm;
    }

    const maximumAverageSpeedKmh = {
      Run: 25,
      Walk: 12,
      Cycle: 80,
    }[activityType];

    const averageSpeedKmh = serverDistanceKm / (elapsedSeconds / 3600);

    if (averageSpeedKmh > maximumAverageSpeedKmh) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(422).json({
        error: 'Activity speed is too high to claim territory',
        averageSpeedKmh: Number(averageSpeedKmh.toFixed(2)),
      });
      return;
    }

    if (
      serverDistanceKm > 0 &&
      Math.abs(reportedDistanceKm - serverDistanceKm) / serverDistanceKm > 0.25
    ) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(422).json({
        error: 'Saved activity distance does not match its GPS route',
      });
      return;
    }

    if (route.length < 10) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(400).json({
        error: 'At least 10 GPS points are required to capture territory',
      });
      return;
    }

    if (route.some(point =>
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      point.latitude < -90 || point.latitude > 90 ||
      point.longitude < -180 || point.longitude > 180
    )) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(400).json({ error: 'Activity contains invalid GPS coordinates' });
      return;
    }

    const first = route[0];
    const last = route[route.length - 1];

    if (distanceBetweenCoordinates(first, last) > 0.05) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(400).json({
        error: 'Route must finish within 50 metres of its starting point',
      });
      return;
    }

    // Close the saved GPS route, then polygonize its noded linework.
    // This handles self-crossing routes without trusting client geometry.
    const ring = [...route];
    ring[ring.length - 1] = first;

    const lineGeoJson = JSON.stringify({
      type: 'LineString',
      coordinates: ring.map(point => [point.longitude, point.latitude]),
    });

    const geometryResult = await client.query<{
      polygon_wkt: string;
      area_m2: number;
      is_valid: boolean;
    }>(
      `
      WITH route_line AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
      ),
      noded AS (
        SELECT ST_Node(geom) AS geom
        FROM route_line
      ),
      polygonized AS (
        SELECT ST_Polygonize(geom) AS geom
        FROM noded
      ),
      candidates AS (
        SELECT (ST_Dump(p.geom)).geom AS geom
        FROM polygonized p
      )
      SELECT
        ST_AsText(geom) AS polygon_wkt,
        ST_Area(geom::geography) AS area_m2,
        ST_IsValid(geom) AS is_valid
      FROM candidates
      WHERE GeometryType(geom) = 'POLYGON'
        AND ST_IsValid(geom)
        AND ST_Area(geom::geography) >= 1000
      ORDER BY ST_Area(geom::geography) DESC
      LIMIT 1
      `,
      [lineGeoJson],
    );

    if (geometryResult.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(400).json({
        error: 'Route does not enclose a valid territory of at least 1,000 m²',
      });
      return;
    }

    const selectedPolygon = geometryResult.rows[0];
    const polygonWkt = `SRID=4326;${selectedPolygon.polygon_wkt}`;
    const areaM2 = Number(selectedPolygon.area_m2);
    const areaKm2 = areaM2 / 1_000_000;

    if (!selectedPolygon.is_valid || !Number.isFinite(areaM2)) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(400).json({ error: 'Could not construct a valid territory polygon' });
      return;
    }

    if (areaM2 < 1000) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(400).json({
        error: 'Territory is too small',
        areaM2,
        areaKm2,
      });
      return;
    }

    // Prevent the same activity from claiming territory more than once.
    const existingClaim = await client.query(
      'SELECT id FROM territories WHERE activity_id = $1',
      [activityId],
    );

    if (existingClaim.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(409).json({ error: 'This activity has already claimed territory' });
      return;
    }

    const conflictsResult = await client.query(
      `
      WITH claim AS (
        SELECT ST_GeogFromText($1) AS polygon
      )
      SELECT
        t.id,
        t.user_id,
        u.username,
        u.display_name,
        t.area_m2,
        t.area_km2,
        ST_Area(ST_Intersection(t.polygon, claim.polygon))
          AS intersection_area_m2
      FROM territories t
      JOIN users u ON u.id = t.user_id
      CROSS JOIN claim
      WHERE ST_Intersects(t.polygon, claim.polygon)
      ORDER BY intersection_area_m2 DESC
      `,
      [polygonWkt],
    );

    if (conflictsResult.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      res.status(409).json({
        error: 'Territory overlaps existing territory',
        areaM2,
        areaKm2,
        conflicts: conflictsResult.rows,
      });
      return;
    }

    const territoryResult = await client.query(
      `
      INSERT INTO territories (
        user_id, activity_id, activity_type, area_m2, area_km2, polygon
      )
      VALUES ($1, $2, $3, $4, $5, ST_GeogFromText($6))
      RETURNING
        id, user_id, activity_id, activity_type,
        area_m2, area_km2,
        ST_AsGeoJSON(polygon::geometry)::json AS polygon,
        captured_at
      `,
      [userId, activityId, activityType, areaM2, areaKm2, polygonWkt],
    );

    const territory = territoryResult.rows[0];

    await client.query(
      `
      INSERT INTO territory_history (
        territory_id, previous_owner_id, new_owner_id, action
      )
      VALUES ($1, NULL, $2, 'CAPTURED')
      `,
      [territory.id, userId],
    );

    await client.query('COMMIT');
    transactionStarted = false;

    res.status(201).json({ ok: true, territory });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch(() => { });
    }
    console.error(error);
    res.status(500).json({ error: 'Failed to claim territory' });
  } finally {
    client.release();
  }
});

router.get('/api/territories/:id', async (req, res) => {
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

router.get('/api/territories/:id/history', async (req, res) => {
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

router.post('/api/territories/:id/challenges', requireAuth, async (req, res) => {
  try {
    const { id: territoryId } = req.params;
    const challengerId = res.locals.authenticatedUserId as string;
    const { activityId } = req.body;

    if (typeof activityId !== 'string' || !activityId.trim()) {
      return res.status(400).json({
        error: 'activityId is required',
      });
    }

    const routeResult = await query<{
      latitude: number;
      longitude: number;
    }>(
      `
  SELECT
    ST_Y(ap.location::geometry) AS latitude,
    ST_X(ap.location::geometry) AS longitude
  FROM activities a
  JOIN activity_points ap ON ap.activity_id = a.id
  WHERE a.id = $1
    AND a.user_id = $2
  ORDER BY ap.sequence_number ASC
  `,
      [activityId, challengerId],
    );

    if (routeResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Activity not found for challenger or has no saved GPS points',
      });
    }

    const route = routeResult.rows.map(point => ({
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
    }));

    if (
      route.length < 10 ||
      route.some(point =>
        !Number.isFinite(point.latitude) ||
        !Number.isFinite(point.longitude) ||
        point.latitude < -90 ||
        point.latitude > 90 ||
        point.longitude < -180 ||
        point.longitude > 180
      )
    ) {
      return res.status(400).json({
        error: 'Activity must contain at least 10 valid GPS points',
      });
    }

    const first = route[0];
    const last = route[route.length - 1];

    if (distanceBetweenCoordinates(first, last) > 0.05) {
      return res.status(400).json({
        error: 'Route must finish within 50 metres of its starting point',
      });
    }

    const ring = [...route];
    ring[ring.length - 1] = first;

    const lineGeoJson = JSON.stringify({
      type: 'LineString',
      coordinates: ring.map(point => [
        point.longitude,
        point.latitude,
      ]),
    });

    const geometryResult = await query<{
      polygon_wkt: string;
      area_m2: number;
      is_valid: boolean;
    }>(
      `
  WITH route_line AS (
    SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
  ),
  noded AS (
    SELECT ST_Node(geom) AS geom
    FROM route_line
  ),
  polygonized AS (
    SELECT ST_Polygonize(geom) AS geom
    FROM noded
  ),
  candidates AS (
    SELECT (ST_Dump(p.geom)).geom AS geom
    FROM polygonized p
  )
  SELECT
    ST_AsText(geom) AS polygon_wkt,
    ST_Area(geom::geography) AS area_m2,
    ST_IsValid(geom) AS is_valid
  FROM candidates
  WHERE GeometryType(geom) = 'POLYGON'
    AND ST_IsValid(geom)
    AND ST_Area(geom::geography) >= 1000
  ORDER BY ST_Area(geom::geography) DESC
  LIMIT 1
  `,
      [lineGeoJson],
    );

    if (geometryResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Route does not enclose a valid territory of at least 1,000 m²',
      });
    }

    const selectedPolygon = geometryResult.rows[0];

    if (
      !selectedPolygon.is_valid ||
      !Number.isFinite(Number(selectedPolygon.area_m2))
    ) {
      return res.status(400).json({
        error: 'Could not construct a valid challenge polygon',
      });
    }

    const polygonWkt = `SRID=4326;${selectedPolygon.polygon_wkt}`;

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

router.post(
  '/api/territories/:id/challenges/:challengeId/resolve',
  requireAuth,
  async (req, res) => {
    const client = await pool.connect();

    try {
      const {
        id: territoryId,
        challengeId,
      } = req.params;

      const resolverId = res.locals.authenticatedUserId as string;
      const { decision } = req.body;

      if (
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

router.get('/api/territories/:id/challenges', async (req, res) => {
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

router.get('/api/territories', async (_req, res) => {
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

  app.use(router);
}

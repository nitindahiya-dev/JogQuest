import { Router, type Express } from 'express';
import type { DeviceProvider } from '../utils/activity.js';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerDevicesRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { calculateRouteDistance, getMockGarminActivity, pool, query, requireAuth } = context;

router.post(
  '/api/users/:userId/integrations/health_connect/import',
  requireAuth,
  async (req, res) => {
    const userId = res.locals.authenticatedUserId as string;
    const workouts = req.body?.workouts;

    if (!Array.isArray(workouts) || workouts.length > 200) {
      return res.status(400).json({
        error: 'Provide a workouts array containing at most 200 workouts.',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const integration = await client.query(
        `SELECT id FROM device_integrations
         WHERE user_id = $1 AND provider = 'health_connect'
           AND status = 'CONNECTED'`,
        [userId],
      );

      if (!integration.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Connect Health Connect before importing workouts.',
        });
      }

      let imported = 0;
      let duplicates = 0;
      let skipped = 0;

      for (const item of workouts) {
        if (
          !item ||
          typeof item.externalId !== 'string' ||
          !item.externalId.trim() ||
          item.externalId.length > 255 ||
          !['Run', 'Walk', 'Cycle'].includes(item.activityType) ||
          typeof item.distanceKm !== 'number' ||
          !Number.isFinite(item.distanceKm) ||
          item.distanceKm < 0 ||
          item.distanceKm > 1000 ||
          !Number.isInteger(item.elapsedSeconds) ||
          item.elapsedSeconds < 1 ||
          item.elapsedSeconds > 604800 ||
          typeof item.startedAt !== 'string' ||
          typeof item.finishedAt !== 'string'
        ) {
          skipped++;
          continue;
        }

        const start = new Date(item.startedAt);
        const finish = new Date(item.finishedAt);
        if (
          !Number.isFinite(start.getTime()) ||
          !Number.isFinite(finish.getTime()) ||
          finish <= start ||
          Math.round((finish.getTime() - start.getTime()) / 1000) > 604800
        ) {
          skipped++;
          continue;
        }

        const paceSeconds = item.distanceKm > 0
          ? Math.round(item.elapsedSeconds / item.distanceKm)
          : 0;
        const pace = paceSeconds
          ? `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, '0')} /km`
          : '0:00 /km';

        const result = await client.query(
          `INSERT INTO activities (
             user_id, activity_type, distance_km, elapsed_seconds,
             pace, started_at, finished_at, source_provider, external_activity_id
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,'health_connect',$8)
           ON CONFLICT (source_provider, external_activity_id)
             WHERE source_provider IS NOT NULL
               AND external_activity_id IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [
            userId,
            item.activityType,
            item.distanceKm,
            item.elapsedSeconds,
            pace,
            start.toISOString(),
            finish.toISOString(),
            item.externalId.trim(),
          ],
        );

        if (result.rows.length) imported++;
        else duplicates++;
      }

      await client.query(
        `UPDATE device_integrations
         SET last_sync_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND provider = 'health_connect'`,
        [userId],
      );

      await client.query('COMMIT');
      return res.json({ imported, duplicates, skipped });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Health Connect workout import failed:', error);
      return res.status(500).json({ error: 'Failed to import workouts.' });
    } finally {
      client.release();
    }
  },
);

router.get(
  '/api/users/:userId/integrations',
  requireAuth, async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;

      const result = await query(
        `
        SELECT
          id,
          provider,
          external_account_id,
          status,
          connected_at,
          last_sync_at,
          created_at,
          updated_at
        FROM device_integrations
        WHERE user_id = $1
        ORDER BY provider ASC
        `,
        [userId],
      );

      res.json(result.rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to fetch device integrations',
      });
    }
  },
);

router.post(
  '/api/users/:userId/integrations/:provider',
  requireAuth, async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const { provider } = req.params;

      const allowedProviders: string[] = ['health_connect'];

      if (
        !allowedProviders.includes(
          provider as DeviceProvider,
        )
      ) {
        return res.status(400).json({
          error:
            'Unsupported device provider',
        });
      }

      const {
        externalAccountId,
      } = req.body as {
        externalAccountId?: string;
      };

      const result = await query(
        `
        INSERT INTO device_integrations (
          user_id,
          provider,
          external_account_id,
          status,
          connected_at,
          last_sync_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'CONNECTED',
          NOW(),
          NULL,
          NOW()
        )
        ON CONFLICT (
          user_id,
          provider
        )
        DO UPDATE SET
          external_account_id =
            EXCLUDED.external_account_id,
          status = 'CONNECTED',
          updated_at = NOW()
        RETURNING
          id,
          provider,
          external_account_id,
          status,
          connected_at,
          last_sync_at,
          created_at,
          updated_at
        `,
        [
          userId,
          provider,
          externalAccountId ?? null,
        ],
      );

      res.status(201).json(
        result.rows[0],
      );
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to connect device integration',
      });
    }
  },
);

router.delete(
  '/api/users/:userId/integrations/:provider',
  requireAuth, async (req, res) => {
    try {
      const userId = res.locals.authenticatedUserId as string;
      const { provider } = req.params;

      const result = await query(
        `
        UPDATE device_integrations
        SET
          status = 'DISCONNECTED',
          updated_at = NOW()
        WHERE user_id = $1
          AND provider = $2
        RETURNING
          id,
          provider,
          status,
          updated_at
        `,
        [
          userId,
          provider,
        ],
      );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Device integration not found',
        });
      }

      res.json({
        ok: true,
        integration:
          result.rows[0],
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Failed to disconnect device integration',
      });
    }
  },
);

router.post(
  '/api/users/:userId/integrations/:provider/import-demo',
  requireAuth, async (req, res) => {
    const client =
      await pool.connect();

    try {
      const userId = res.locals.authenticatedUserId as string;
      const { provider } = req.params;

      if (
        provider !== 'garmin'
      ) {
        return res.status(400).json({
          error:
            'Demo import currently supports Garmin only',
        });
      }

      const integrationResult =
        await client.query(
          `
          SELECT
            id,
            status
          FROM device_integrations
          WHERE user_id = $1
            AND provider = $2
          `,
          [
            userId,
            provider,
          ],
        );

      if (
        integrationResult.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Device integration not found',
        });
      }

      if (
        integrationResult.rows[0].status !==
        'CONNECTED'
      ) {
        return res.status(409).json({
          error:
            'Device integration is not connected',
        });
      }

      const normalized =
        getMockGarminActivity();

      const existing =
        await client.query(
          `
          SELECT
            id,
            created_at
          FROM activities
          WHERE source_provider = $1
            AND external_activity_id = $2
          `,
          [
            normalized.provider,
            normalized.externalId,
          ],
        );

      if (
        existing.rows.length > 0
      ) {
        return res.json({
          imported: false,
          duplicate: true,
          activity:
            existing.rows[0],
        });
      }

      const serverDistanceKm =
        calculateRouteDistance(
          normalized.route,
        );

      await client.query(
        'BEGIN',
      );

      const activityResult =
        await client.query(
          `
          INSERT INTO activities (
            user_id,
            activity_type,
            distance_km,
            elapsed_seconds,
            pace,
            started_at,
            finished_at,
            source_provider,
            external_activity_id
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9
          )
          RETURNING
            id,
            created_at
          `,
          [
            userId,
            normalized.activityType,
            serverDistanceKm,
            normalized.elapsedSeconds,
            '--',
            normalized.startedAt,
            normalized.finishedAt,
            normalized.provider,
            normalized.externalId,
          ],
        );

      const activity =
        activityResult.rows[0];

      for (
        let index = 0;
        index <
        normalized.route.length;
        index += 1
      ) {
        const point =
          normalized.route[index];

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

      await client.query(
        `
        UPDATE device_integrations
        SET
          last_sync_at = NOW(),
          updated_at = NOW()
        WHERE user_id = $1
          AND provider = $2
        `,
        [
          userId,
          provider,
        ],
      );

      await client.query(
        'COMMIT',
      );

      res.status(201).json({
        imported: true,
        duplicate: false,
        provider:
          normalized.provider,
        externalId:
          normalized.externalId,
        activity,
        distanceKm:
          serverDistanceKm,
      });
    } catch (error) {
      await client.query(
        'ROLLBACK',
      );

      console.error(error);

      res.status(500).json({
        error:
          'Failed to import external activity',
      });
    } finally {
      client.release();
    }
  },
);

  app.use(router);
}

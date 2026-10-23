import { Router, type Express } from 'express';
import type { RouteMode, RouteCoordinate } from '../index.js';

type RouteContext = Record<string, any> & {
  pool: typeof import('../db.js').pool;
  query: typeof import('../db.js').query;
  avatarUpload: typeof import('../index.js').avatarUpload;
};

export function registerRoutesRoutes<T extends RouteContext>(
  app: Express,
  context: T,
): void {
  const router = Router();
  const { fetchRouteWithRetry } = context;

router.post(
  '/api/routes',
  async (req, res) => {
    try {
      const {
        activityType,
        points,
      } = req.body as {
        activityType?: RouteMode;
        points?: RouteCoordinate[];
      };

      // ----------------------------------------------
      // VALIDATE ACTIVITY TYPE
      // ----------------------------------------------

      if (
        activityType !== 'Run' &&
        activityType !== 'Walk' &&
        activityType !== 'Cycle'
      ) {
        return res.status(400).json({
          error:
            'activityType must be Run, Walk, or Cycle',
        });
      }

      // ----------------------------------------------
      // VALIDATE POINTS
      // ----------------------------------------------

      if (
        !Array.isArray(points) ||
        points.length < 2
      ) {
        return res.status(400).json({
          error:
            'At least two route points are required',
        });
      }

      if (points.length > 20) {
        return res.status(400).json({
          error:
            'A maximum of 20 route points is supported',
        });
      }

      for (const point of points) {
        if (
          !point ||
          typeof point.latitude !== 'number' ||
          typeof point.longitude !== 'number' ||
          !Number.isFinite(
            point.latitude,
          ) ||
          !Number.isFinite(
            point.longitude,
          ) ||
          point.latitude < -90 ||
          point.latitude > 90 ||
          point.longitude < -180 ||
          point.longitude > 180
        ) {
          return res.status(400).json({
            error:
              'Invalid route coordinate',
          });
        }
      }

      // ----------------------------------------------
      // SELECT ROUTING PROFILE
      // ----------------------------------------------

      const routingHost =
        activityType === 'Cycle'
          ? 'https://routing.openstreetmap.de/routed-bike'
          : 'https://routing.openstreetmap.de/routed-foot';

      // The FOSSGIS routing service uses the
      // /route/v1/driving path format for these
      // OSRM-compatible endpoints.
      const coordinates =
        points
          .map(
            point =>
              `${point.longitude},${point.latitude}`,
          )
          .join(';');

      const url =
        `${routingHost}/route/v1/driving/${coordinates}` +
        '?overview=full' +
        '&geometries=geojson';

      const response =
        await fetchRouteWithRetry(
          url,
        );

      if (!response.ok) {
        const errorText =
          await response.text();

        console.error(
          'Routing provider HTTP error:',
          response.status,
          errorText,
        );

        return res.status(502).json({
          error:
            'Routing provider request failed',
        });
      }

      const data =
        (await response.json()) as {
          code?: string;
          routes?: Array<{
            distance?: number;
            duration?: number;
            geometry?: {
              type?: string;
              coordinates?: number[][];
            };
          }>;
        };

      if (
        data.code !== 'Ok' ||
        !data.routes?.length
      ) {
        return res.status(502).json({
          error:
            'No route could be generated',
        });
      }

      const selectedRoute =
        data.routes[0];

      if (
        !selectedRoute.geometry?.coordinates ||
        selectedRoute.geometry.coordinates.length <
        2
      ) {
        return res.status(502).json({
          error:
            'Routing provider returned an invalid route',
        });
      }

      // ----------------------------------------------
      // CONVERT GEOJSON
      // ----------------------------------------------

      const route =
        selectedRoute.geometry.coordinates
          .map(coordinate => ({
            latitude:
              coordinate[1],

            longitude:
              coordinate[0],
          }));

      const distanceKm =
        Number(
          selectedRoute.distance ?? 0,
        ) / 1000;

      const durationSeconds =
        Number(
          selectedRoute.duration ?? 0,
        );

      res.json({
        activityType,

        distanceKm,

        durationSeconds,

        points,

        route,
      });
    } catch (error) {
      console.error(
        'Route planner error:',
        error,
      );

      res.status(500).json({
        error:
          'Failed to generate route',
      });
    }
  },
);

  app.use(router);
}

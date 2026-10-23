import type { Coordinate } from './geo.js';

export type DeviceProvider =
  | 'garmin'
  | 'suunto'
  | 'polar'
  | 'coros'
  | 'fitbit'
  | 'wahoo'
  | 'hammerhead';

export type NormalizedExternalActivity = {
  provider: DeviceProvider;
  externalId: string;
  activityType: 'Run' | 'Walk' | 'Cycle';
  distanceKm: number;
  elapsedSeconds: number;
  startedAt: string;
  finishedAt: string;
  route: Coordinate[];
};

export type CreateActivityBody = {
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

export const getMockGarminActivity =
  (): NormalizedExternalActivity => {
    return {
      provider: 'garmin',

      externalId:
        'garmin-demo-activity-001',

      activityType: 'Run',

      distanceKm: 2.4,

      elapsedSeconds: 1320,

      startedAt:
        new Date(
          Date.now() - 1320 * 1000,
        ).toISOString(),

      finishedAt:
        new Date().toISOString(),

      route: [
        {
          latitude: 28.6139,
          longitude: 77.2090,
        },
        {
          latitude: 28.6143,
          longitude: 77.2100,
        },
        {
          latitude: 28.6148,
          longitude: 77.2105,
        },
        {
          latitude: 28.6152,
          longitude: 77.2100,
        },
        {
          latitude: 28.6155,
          longitude: 77.2095,
        },
        {
          latitude: 28.6150,
          longitude: 77.2090,
        },
      ],
    };
  };


export type Coordinate = {
  latitude: number;
  longitude: number;
  timestamp?: number;
};

type ActivityType = 'Run' | 'Walk' | 'Cycle';

type ActivityInput = {
  activityType: unknown;
  distanceKm: unknown;
  elapsedSeconds: unknown;
  route: unknown;
};

type ValidationFailure = {
  ok: false;
  status: 400 | 422;
  body: Record<string, unknown>;
};

type ValidationSuccess = {
  ok: true;
  serverDistanceKm: number;
};

export type ActivityGpsValidation =
  | ValidationSuccess
  | ValidationFailure;

const MAX_SEGMENT_DISTANCE_KM = 0.5;
const DISTANCE_TOLERANCE = 0.25;
const SEGMENT_SPEED_TOLERANCE = 1.25;
const MIN_SEGMENT_SPEED_CHECK_KM = 0.03;

const MAX_SPEED_KMH: Record<ActivityType, number> = {
  Run: 25,
  Walk: 12,
  Cycle: 80,
};

const distanceBetweenCoordinates = (
  a: Coordinate,
  b: Coordinate,
): number => {
  const earthRadiusKm = 6371;
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const lat1 = a.latitude * radians;
  const lat2 = b.latitude * radians;

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  const boundedHaversine = Math.max(0, Math.min(1, haversine));

  return (
    earthRadiusKm *
    2 *
    Math.atan2(
      Math.sqrt(boundedHaversine),
      Math.sqrt(1 - boundedHaversine),
    )
  );
};

const failure = (
  status: 400 | 422,
  error: string,
  extra: Record<string, unknown> = {},
): ValidationFailure => ({
  ok: false,
  status,
  body: { error, ...extra },
});

export function validateActivityGps(
  body: ActivityInput,
): ActivityGpsValidation {
  if (
    !['Run', 'Walk', 'Cycle'].includes(body.activityType as string) ||
    typeof body.distanceKm !== 'number' ||
    typeof body.elapsedSeconds !== 'number' ||
    !Array.isArray(body.route)
  ) {
    return failure(400, 'Invalid activity data');
  }

  if (
    !Number.isFinite(body.elapsedSeconds) ||
    body.elapsedSeconds <= 0
  ) {
    return failure(400, 'Elapsed time must be a positive finite number');
  }

  if (
    !Number.isFinite(body.distanceKm) ||
    body.distanceKm < 0
  ) {
    return failure(400, 'Invalid activity distance');
  }

  if (body.route.length < 2) {
    return failure(400, 'Route must contain at least two points');
  }

  const route = body.route as Coordinate[];

  if (
    route.some(point =>
      !point ||
      typeof point !== 'object' ||
      !Number.isFinite(point.latitude) ||
      !Number.isFinite(point.longitude) ||
      point.latitude < -90 ||
      point.latitude > 90 ||
      point.longitude < -180 ||
      point.longitude > 180
    )
  ) {
    return failure(400, 'Route contains invalid GPS coordinates');
  }

  // Older activities without timestamps remain supported.
  // If any timestamp is supplied, require valid timestamps on every point.
  const hasTimestamps = route.some(
    point => point.timestamp !== undefined,
  );

  if (
    hasTimestamps &&
    route.some(
      point =>
        !Number.isFinite(point.timestamp) ||
        (point.timestamp as number) <= 0,
    )
  ) {
    return failure(
      400,
      'Timestamped routes must contain a valid timestamp for every point',
    );
  }

  let serverDistanceKm = 0;
  const activityType = body.activityType as ActivityType;
  const maximumSpeedKmh = MAX_SPEED_KMH[activityType];

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];

    const segmentDistanceKm = distanceBetweenCoordinates(
      previous,
      current,
    );

    if (!Number.isFinite(segmentDistanceKm)) {
      return failure(400, 'Invalid GPS route');
    }

    if (segmentDistanceKm > MAX_SEGMENT_DISTANCE_KM) {
      return failure(422, 'Activity contains an impossible GPS jump', {
        segmentDistanceKm,
        segmentIndex: index,
      });
    }

    if (hasTimestamps) {
      const elapsedMilliseconds =
        (current.timestamp as number) -
        (previous.timestamp as number);

      if (elapsedMilliseconds <= 0) {
        return failure(
          422,
          'GPS timestamps must be strictly increasing',
          { segmentIndex: index },
        );
      }

      const segmentSpeedKmh =
        segmentDistanceKm / (elapsedMilliseconds / 3_600_000);

      // Ignore very short segments for speed checks because GPS jitter
      // can produce misleading speeds over a few metres.
      if (
        segmentDistanceKm >= MIN_SEGMENT_SPEED_CHECK_KM &&
        segmentSpeedKmh > maximumSpeedKmh * SEGMENT_SPEED_TOLERANCE
      ) {
        return failure(
          422,
          'GPS segment speed exceeds the allowed limit',
          {
            segmentIndex: index,
            segmentSpeedKmh: Number(segmentSpeedKmh.toFixed(2)),
          },
        );
      }
    }

    serverDistanceKm += segmentDistanceKm;
  }

  if (!Number.isFinite(serverDistanceKm)) {
    return failure(400, 'Invalid GPS route');
  }

  const averageSpeedKmh =
    serverDistanceKm / (body.elapsedSeconds / 3600);

  if (averageSpeedKmh > maximumSpeedKmh) {
    return failure(
      422,
      'Activity average speed exceeds the allowed limit',
      {
        activityType,
        averageSpeedKmh: Number(averageSpeedKmh.toFixed(2)),
        maximumSpeedKmh,
      },
    );
  }

  if (serverDistanceKm > 0 && body.distanceKm > 0) {
    const difference =
      Math.abs(body.distanceKm - serverDistanceKm) /
      serverDistanceKm;

    if (difference > DISTANCE_TOLERANCE) {
      return failure(
        422,
        'Reported distance does not match GPS route',
        {
          reportedDistanceKm: body.distanceKm,
          serverDistanceKm,
        },
      );
    }
  }

  return { ok: true, serverDistanceKm };
}

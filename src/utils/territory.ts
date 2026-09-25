import {area, lineString, lineToPolygon} from '@turf/turf';

import type {Coordinate} from './geo';

export type TerritoryResult = {
  captured: boolean;
  areaM2: number;
  areaKm2: number;
  polygon: Coordinate[];
};

const CLOSURE_DISTANCE_KM = 0.05; // 50 meters
const MIN_POINTS = 10;
const MIN_AREA_M2 = 1000;

const distanceBetween = (
  a: Coordinate,
  b: Coordinate,
) => {
  const earthRadius = 6371;

  const toRadians = (value: number) =>
    (value * Math.PI) / 180;

  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  const c =
    2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return earthRadius * c;
};

export const createTerritory = (
  route: Coordinate[],
): TerritoryResult => {
  if (route.length < MIN_POINTS) {
    return {
      captured: false,
      areaM2: 0,
      areaKm2: 0,
      polygon: [],
    };
  }

  const first = route[0];
  const last = route[route.length - 1];

  const closureDistance = distanceBetween(first, last);

  // Route must finish within 50 meters of the start.
  if (closureDistance > CLOSURE_DISTANCE_KM) {
    return {
      captured: false,
      areaM2: 0,
      areaKm2: 0,
      polygon: [],
    };
  }

  const coordinates = route.map(point => [
    point.longitude,
    point.latitude,
  ] as [number, number]);

  const line = lineString(coordinates);

  const polygonFeature = lineToPolygon(line, {
    autoComplete: true,
  });

  const areaM2 = area(polygonFeature);
  const areaKm2 = areaM2 / 1_000_000;

  if (areaM2 < MIN_AREA_M2) {
    return {
      captured: false,
      areaM2,
      areaKm2,
      polygon: [],
    };
  }

  const ring = polygonFeature.geometry.coordinates[0];

  const polygon: Coordinate[] = ring.map(
    ([longitude, latitude]) => ({
      latitude,
      longitude,
    }),
  );

  return {
    captured: true,
    areaM2,
    areaKm2,
    polygon,
  };
};
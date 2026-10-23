export type Coordinate = {
  latitude: number;
  longitude: number;
  timestamp?: number;
};

export const distanceBetweenCoordinates = (
  a: Coordinate,
  b: Coordinate,
) => {
  const earthRadiusKm = 6371;

  const dLat =
    ((b.latitude - a.latitude) *
      Math.PI) /
    180;

  const dLon =
    ((b.longitude - a.longitude) *
      Math.PI) /
    180;

  const lat1 =
    (a.latitude * Math.PI) /
    180;

  const lat2 =
    (b.latitude * Math.PI) /
    180;

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return (
    earthRadiusKm *
    2 *
    Math.atan2(
      Math.sqrt(haversine),
      Math.sqrt(1 - haversine),
    )
  );
};

export const calculateRouteDistance = (
  route: Coordinate[],
) => {
  let total = 0;

  for (
    let index = 1;
    index < route.length;
    index += 1
  ) {
    total += distanceBetweenCoordinates(
      route[index - 1],
      route[index],
    );
  }

  return total;
};

import type { Coordinate } from "../types/route";

const EARTH_RADIUS_METERS = 6_371_008.8;

const rad = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineDistance(a: Coordinate, b: Coordinate): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const lat1 = rad(a[1]);
  const lat2 = rad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function polylineDistance(coordinates: Coordinate[]): number {
  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1)
    total += haversineDistance(coordinates[i - 1], coordinates[i]);
  return total;
}

export function distanceToRoute(point: Coordinate, route: Coordinate[]): number {
  if (!route.length) return Infinity;
  return Math.min(...route.map((candidate) => haversineDistance(point, candidate)));
}

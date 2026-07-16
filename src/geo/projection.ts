import type { Coordinate } from "../types/route";

const METERS_PER_DEGREE = 111_320;

export function meanLatitude(coordinates: Coordinate[]): number {
  if (!coordinates.length) return 0;
  return coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0) / coordinates.length;
}

export function projectLocal(coordinate: Coordinate, origin: Coordinate): [number, number] {
  const scale = Math.cos((origin[1] * Math.PI) / 180);
  return [
    (coordinate[0] - origin[0]) * METERS_PER_DEGREE * scale,
    (coordinate[1] - origin[1]) * METERS_PER_DEGREE,
  ];
}

export function quantize(point: [number, number], gridMeters = 18): string {
  return `${Math.round(point[0] / gridMeters)},${Math.round(point[1] / gridMeters)}`;
}

export function centroid(coordinates: Coordinate[]): Coordinate {
  if (!coordinates.length) return [0, 0];
  const [lon, lat] = coordinates.reduce(
    ([x, y], coordinate) => [x + coordinate[0], y + coordinate[1]],
    [0, 0],
  );
  return [lon / coordinates.length, lat / coordinates.length];
}

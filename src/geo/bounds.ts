import type { Coordinate } from "../types/route";

export function routeBounds(
  coordinates: Coordinate[],
): [[number, number], [number, number]] | undefined {
  if (!coordinates.length) return undefined;
  const lons = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

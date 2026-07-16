import { MAX_RESAMPLED_POINTS } from "../config/app";
import type { Coordinate } from "../types/route";
import { haversineDistance } from "./distance";

export function resampleRoute(
  coordinates: Coordinate[],
  spacingMeters = 20,
  maxPoints = MAX_RESAMPLED_POINTS,
): Coordinate[] {
  if (coordinates.length < 2) return [...coordinates];
  const output: Coordinate[] = [coordinates[0]];
  for (let i = 1; i < coordinates.length && output.length < maxPoints - 1; i += 1) {
    const from = coordinates[i - 1];
    const to = coordinates[i];
    const segment = haversineDistance(from, to);
    if (!Number.isFinite(segment) || segment === 0) continue;
    const divisions = Math.max(1, Math.ceil(segment / spacingMeters));
    for (let division = 1; division <= divisions && output.length < maxPoints; division += 1) {
      const t = division / divisions;
      const point: number[] = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      if (from.length > 2 && to.length > 2)
        point.push((from[2] ?? 0) + ((to[2] ?? 0) - (from[2] ?? 0)) * t);
      output.push(point as Coordinate);
    }
  }
  const last = coordinates.at(-1)!;
  if (output.at(-1)?.[0] !== last[0] || output.at(-1)?.[1] !== last[1]) output.push(last);
  return output;
}

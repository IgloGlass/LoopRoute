import type { Coordinate, SurfaceSummary } from "../types/route";
import { haversineDistance } from "./distance";

// openrouteservice surface encodings. Generic paved/unpaved values are kept alongside
// the more precise materials so incomplete OpenStreetMap tagging still contributes.
const PAVED = new Set([1, 3, 4, 5, 6, 7, 14, 18]);
const UNPAVED = new Set([2, 8, 9, 10, 11, 12, 13, 15, 16, 17]);

export interface ExtraSummaryItem {
  value: number;
  distance?: number;
  amount?: number;
}

export function extraDistances(
  values: Array<[number, number, number]> | undefined,
  coordinates: Coordinate[],
  summary?: ExtraSummaryItem[],
): Map<number, number> {
  const distances = new Map<number, number>();
  if (summary?.length) {
    for (const item of summary) {
      const weight = Number.isFinite(item.distance)
        ? Math.max(0, item.distance!)
        : Number.isFinite(item.amount)
          ? Math.max(0, item.amount!)
          : 0;
      distances.set(item.value, (distances.get(item.value) ?? 0) + weight);
    }
    return distances;
  }
  for (const [rawStart, rawEnd, id] of values ?? []) {
    const start = Math.max(0, Math.floor(rawStart));
    const end = Math.min(coordinates.length - 1, Math.floor(rawEnd));
    let distance = 0;
    for (let index = start; index < end; index += 1)
      distance += haversineDistance(coordinates[index], coordinates[index + 1]);
    distances.set(id, (distances.get(id) ?? 0) + distance);
  }
  return distances;
}

export function summarizeSurfaces(
  values: Array<[number, number, number]> | undefined,
  coordinates: Coordinate[],
  encodedSummary?: ExtraSummaryItem[],
): SurfaceSummary | undefined {
  const distances = extraDistances(values, coordinates, encodedSummary);
  if (!distances.size) return undefined;
  let paved = 0;
  let unpaved = 0;
  let unknown = 0;
  for (const [id, distance] of distances) {
    if (PAVED.has(id)) paved += distance;
    else if (UNPAVED.has(id)) unpaved += distance;
    else unknown += distance;
  }
  const divisor = paved + unpaved + unknown;
  if (divisor <= 0) return undefined;
  const summary = {
    pavedPercent: (paved / divisor) * 100,
    unpavedPercent: (unpaved / divisor) * 100,
    unknownPercent: (unknown / divisor) * 100,
    dominant: "Unknown",
  };
  summary.dominant =
    summary.pavedPercent >= summary.unpavedPercent && summary.pavedPercent >= summary.unknownPercent
      ? "Paved"
      : summary.unpavedPercent >= summary.unknownPercent
        ? "Unpaved"
        : "Unknown";
  return summary;
}

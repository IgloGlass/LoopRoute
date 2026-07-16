import type { SurfaceSummary } from "../types/route";

const PAVED = new Set([1, 2, 3, 4]);
const UNPAVED = new Set([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

export function summarizeSurfaces(
  values: Array<[number, number, number]> | undefined,
  totalDistance: number,
): SurfaceSummary | undefined {
  if (!values?.length || totalDistance <= 0) return undefined;
  let paved = 0;
  let unpaved = 0;
  let unknown = 0;
  for (const [start, end, id] of values) {
    const distance = Math.max(0, end - start);
    if (PAVED.has(id)) paved += distance;
    else if (UNPAVED.has(id)) unpaved += distance;
    else unknown += distance;
  }
  const divisor = paved + unpaved + unknown || totalDistance;
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

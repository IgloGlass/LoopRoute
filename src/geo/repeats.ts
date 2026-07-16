import type { Coordinate, RepeatMetrics } from "../types/route";
import { haversineDistance } from "./distance";
import { centroid, projectLocal, quantize } from "./projection";
import { resampleRoute } from "./resample";

export function repeatedEdges(coordinates: Coordinate[], gridMeters = 18): RepeatMetrics {
  const points = resampleRoute(coordinates);
  const origin = centroid(points);
  const directed = new Map<string, number>();
  const undirected = new Map<string, number>();
  let directedRepeatMeters = 0;
  let undirectedRepeatMeters = 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = quantize(projectLocal(points[i - 1], origin), gridMeters);
    const b = quantize(projectLocal(points[i], origin), gridMeters);
    if (a === b) continue;
    const length = haversineDistance(points[i - 1], points[i]);
    const directedKey = `${a}>${b}`;
    const undirectedKey = [a, b].sort().join("|");
    if (directed.has(directedKey)) directedRepeatMeters += length;
    if (undirected.has(undirectedKey)) undirectedRepeatMeters += length;
    directed.set(directedKey, (directed.get(directedKey) ?? 0) + length);
    undirected.set(undirectedKey, (undirected.get(undirectedKey) ?? 0) + length);
    total += length;
  }
  return {
    directedRepeatMeters,
    directedRepeatRatio: total ? directedRepeatMeters / total : 0,
    undirectedRepeatMeters,
    undirectedRepeatRatio: total ? undirectedRepeatMeters / total : 0,
    undirectedEdges: new Set(undirected.keys()),
  };
}

export function routeSimilarity(a: Coordinate[], b: Coordinate[]): number {
  const aEdges = repeatedEdges(a).undirectedEdges;
  const bEdges = repeatedEdges(b).undirectedEdges;
  const union = new Set([...aEdges, ...bEdges]);
  if (!union.size) return 1;
  let intersection = 0;
  for (const edge of aEdges) if (bEdges.has(edge)) intersection += 1;
  return intersection / union.size;
}

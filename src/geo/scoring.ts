import type { Coordinate, RouteMetrics } from "../types/route";
import { haversineDistance, polylineDistance } from "./distance";
import { centroid, projectLocal } from "./projection";
import { repeatedEdges } from "./repeats";
import { resampleRoute } from "./resample";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export function distanceErrorPercent(actual: number, target: number): number {
  return target > 0 ? (Math.abs(actual - target) / target) * 100 : 100;
}

export function compactnessScore(coordinates: Coordinate[]): number {
  const points = resampleRoute(coordinates);
  if (points.length < 3) return 0;
  const center = centroid(points);
  const radii = points.map((point) => Math.hypot(...projectLocal(point, center)));
  const mean = radii.reduce((sum, value) => sum + value, 0) / radii.length;
  if (mean < 1) return 0;
  const variance = radii.reduce((sum, value) => sum + (value - mean) ** 2, 0) / radii.length;
  return clamp(100 - (Math.sqrt(variance) / mean) * 140);
}

export function scoreRoute(coordinates: Coordinate[], targetDistanceMeters: number): RouteMetrics {
  const actual = polylineDistance(coordinates);
  const error = distanceErrorPercent(actual, targetDistanceMeters);
  const closure =
    coordinates.length > 1 ? haversineDistance(coordinates[0], coordinates.at(-1)!) : Infinity;
  const repeats = repeatedEdges(coordinates);
  const directedPercent = repeats.directedRepeatRatio * 100;
  const repeatedPercent = repeats.undirectedRepeatRatio * 100;
  const distanceScore = clamp(100 - error * 20);
  const repeatScore = clamp(100 - repeatedPercent * 3 - directedPercent * 1.5);
  const closureScore = clamp(100 - closure / 2);
  const compactness = compactnessScore(coordinates);
  const overallScore = Math.round(
    0.35 * distanceScore + 0.4 * repeatScore + 0.1 * closureScore + 0.15 * compactness,
  );
  const quality =
    error <= 3 && repeatedPercent <= 10
      ? "excellent"
      : error <= 5 && repeatedPercent <= 20
        ? "good"
        : "compromised";
  const warnings: string[] = [];
  if (error > 5) warnings.push("Distance is outside the 5% target tolerance.");
  if (repeatedPercent > 20) warnings.push("More than 20% of this route is repeated.");
  if (repeatedPercent - directedPercent > 12)
    warnings.push("This route includes substantial out-and-back travel.");
  if (closure > 50) warnings.push("The route does not close near the start.");
  return {
    distanceErrorPercent: error,
    closureDistanceMeters: closure,
    directedRepeatPercent: directedPercent,
    repeatedRoutePercent: repeatedPercent,
    compactnessScore: compactness,
    distanceScore,
    repeatScore,
    closureScore,
    overallScore,
    quality,
    warnings,
  };
}

import type { RoutePriorities } from "../config/app";
import type {
  Coordinate,
  EnvironmentSummary,
  RouteInstruction,
  RouteMetrics,
  RouteWarning,
  SurfaceSummary,
} from "../types/route";
import { haversineDistance, polylineDistance } from "./distance";
import { repeatedEdges } from "./repeats";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const DECISION_TURN_TYPES = new Set([0, 1, 2, 3, 4, 5, 7, 9, 12, 13]);

export const countDecisionTurns = (instructions: RouteInstruction[]): number =>
  instructions.filter((instruction) =>
    instruction.type === undefined ? false : DECISION_TURN_TYPES.has(instruction.type),
  ).length;

export function distanceErrorPercent(actual: number, target: number): number {
  return target > 0 ? (Math.abs(actual - target) / target) * 100 : 100;
}

export function preferenceScore(
  priorities: RoutePriorities,
  surface?: SurfaceSummary,
  environment?: EnvironmentSummary,
): { score: number; coverage: number } {
  const evidence: Array<number | undefined> = [];
  // ORS' green evidence combines trees, parks, and rivers. For water, sustained
  // high-green travel is a better proxy for following a shoreline than a brief pass-by.
  if (priorities.water)
    evidence.push(
      environment?.greenContinuityPercent === undefined
        ? undefined
        : environment.greenContinuityPercent * 0.75 + (environment.greenPercent ?? 50) * 0.25,
    );
  if (priorities.woodland) evidence.push(environment?.greenPercent);
  if (priorities.unpaved) evidence.push(surface?.unpavedPercent);
  if (priorities.quiet) evidence.push(environment?.quietPercent);
  if (!evidence.length) return { score: 100, coverage: 100 };
  const known = evidence.filter((value): value is number => value !== undefined);
  return {
    score: Math.round(
      evidence.reduce((sum: number, value) => sum + (value ?? 50), 0) / evidence.length,
    ),
    coverage: Math.round((known.length / evidence.length) * 100),
  };
}

export function scoreRoute(
  coordinates: Coordinate[],
  targetDistanceMeters: number,
  priorities: RoutePriorities,
  surface?: SurfaceSummary,
  environment?: EnvironmentSummary,
  instructions: RouteInstruction[] = [],
): RouteMetrics {
  const actual = polylineDistance(coordinates);
  const error = distanceErrorPercent(actual, targetDistanceMeters);
  const closure =
    coordinates.length > 1 ? haversineDistance(coordinates[0], coordinates.at(-1)!) : Infinity;
  const repeats = repeatedEdges(coordinates);
  const directedPercent = repeats.directedRepeatRatio * 100;
  const repeatedPercent = repeats.undirectedRepeatRatio * 100;
  const distanceScore = clamp(100 * Math.exp(-0.5 * (error / 4) ** 2));
  const repeatScore = clamp(100 - repeatedPercent * 2.5 - directedPercent * 0.75);
  const closureScore = clamp(100 - Math.max(0, closure - 10) * 1.5);
  const preference = preferenceScore(priorities, surface, environment);
  const turnCount = countDecisionTurns(instructions);
  const turnsPerKilometre = actual > 0 ? turnCount / (actual / 1000) : 0;
  const turnScore = clamp(100 - turnsPerKilometre * 25);
  const overallScore = Math.round(
    0.29 * distanceScore +
      0.28 * repeatScore +
      0.08 * closureScore +
      0.2 * preference.score +
      0.15 * turnScore,
  );
  const quality =
    error <= 3 && repeatedPercent <= 10 && closure <= 50
      ? "excellent"
      : error <= 5 && repeatedPercent <= 20 && closure <= 100
        ? "good"
        : "compromised";
  const warnings: RouteWarning[] = [];
  if (error > 5) warnings.push("distanceTolerance");
  if (repeatedPercent > 20) warnings.push("highRepetition");
  if (repeatedPercent - directedPercent > 12) warnings.push("outAndBack");
  if (closure > 50) warnings.push("openLoop");
  return {
    distanceErrorPercent: error,
    closureDistanceMeters: closure,
    directedRepeatPercent: directedPercent,
    repeatedRoutePercent: repeatedPercent,
    distanceScore,
    repeatScore,
    closureScore,
    preferenceScore: preference.score,
    preferenceDataCoverage: preference.coverage,
    turnCount,
    turnsPerKilometre,
    turnScore,
    overallScore,
    quality,
    warnings,
  };
}

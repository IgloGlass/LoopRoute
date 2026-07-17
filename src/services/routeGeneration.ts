import { routeSimilarity } from "../geo/repeats";
import type { RoutingProvider } from "../providers/routing/types";
import type { NormalizedRoute, RouteRequest } from "../types/route";

const INITIAL_SHAPE_POINTS = [2, 3, 4] as const;
const SIMILARITY_LIMIT = 0.75;

export const randomSeed = (): number => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return (value[0] % 2_000_000_000) + 1;
};

export async function generateCandidates(
  provider: RoutingProvider,
  base: Omit<RouteRequest, "seed" | "roundTripPoints">,
  signal?: AbortSignal,
): Promise<{ routes: NormalizedRoute[]; errors: Error[] }> {
  const initialSeeds = new Set<number>();
  while (initialSeeds.size < 3) initialSeeds.add(randomSeed());
  const settled = await Promise.allSettled(
    [...initialSeeds].map((seed, index) =>
      provider.route({ ...base, seed, roundTripPoints: INITIAL_SHAPE_POINTS[index] }, signal),
    ),
  );
  const routes: NormalizedRoute[] = [];
  const errors: Error[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && isDistinctCandidate(routes, result.value))
      routes.push(result.value);
    else if (result.status === "rejected")
      errors.push(
        result.reason instanceof Error ? result.reason : new Error("Route generation failed."),
      );
  }
  let retryCalls = 0;
  while (
    (routes.length < 3 ||
      routes.filter((route) => route.metrics.quality !== "compromised").length < 3) &&
    retryCalls < 2 &&
    !signal?.aborted
  ) {
    retryCalls += 1;
    try {
      const candidate = await provider.route(
        {
          ...base,
          seed: randomSeed(),
          roundTripPoints: INITIAL_SHAPE_POINTS[(retryCalls + 1) % INITIAL_SHAPE_POINTS.length],
        },
        signal,
      );
      if (isDistinctCandidate(routes, candidate)) routes.push(candidate);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error("Route generation failed."));
    }
  }
  return { routes: selectDiverseCandidates(routes, 3), errors };
}

export function isDistinctCandidate(
  routes: NormalizedRoute[],
  candidate: NormalizedRoute,
): boolean {
  return !routes.some(
    (route) => routeSimilarity(route.coordinates, candidate.coordinates) >= SIMILARITY_LIMIT,
  );
}

export function selectDiverseCandidates(
  candidates: NormalizedRoute[],
  limit: number,
): NormalizedRoute[] {
  const remaining = [...candidates];
  const selected: NormalizedRoute[] = [];
  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestUtility = -Infinity;
    remaining.forEach((candidate, index) => {
      const similarity = selected.length
        ? Math.max(
            ...selected.map((route) => routeSimilarity(route.coordinates, candidate.coordinates)),
          )
        : 0;
      const utility = candidate.metrics.overallScore - similarity * 30;
      if (utility > bestUtility) {
        bestUtility = utility;
        bestIndex = index;
      }
    });
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected;
}

export const exploratoryShapePoints = (seed: number): number => 2 + (seed % 4);

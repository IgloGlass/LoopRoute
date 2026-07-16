import { routeSimilarity } from "../geo/repeats";
import type { RoutingProvider } from "../providers/routing/types";
import type { NormalizedRoute, RouteRequest } from "../types/route";

export const randomSeed = (): number => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return (value[0] % 2_000_000_000) + 1;
};

export async function generateCandidates(
  provider: RoutingProvider,
  base: Omit<RouteRequest, "seed">,
  signal?: AbortSignal,
): Promise<{ routes: NormalizedRoute[]; errors: Error[] }> {
  const initialSeeds = new Set<number>();
  while (initialSeeds.size < 3) initialSeeds.add(randomSeed());
  const settled = await Promise.allSettled(
    [...initialSeeds].map((seed) => provider.route({ ...base, seed }, signal)),
  );
  const routes: NormalizedRoute[] = [];
  const errors: Error[] = [];
  for (const result of settled) {
    if (
      result.status === "fulfilled" &&
      !routes.some((route) => routeSimilarity(route.coordinates, result.value.coordinates) >= 0.75)
    )
      routes.push(result.value);
    else if (result.status === "rejected")
      errors.push(
        result.reason instanceof Error ? result.reason : new Error("Route generation failed."),
      );
  }
  let retryCalls = 0;
  while (routes.length < 3 && retryCalls < 2 && !signal?.aborted) {
    retryCalls += 1;
    try {
      const candidate = await provider.route({ ...base, seed: randomSeed() }, signal);
      if (
        !routes.some((route) => routeSimilarity(route.coordinates, candidate.coordinates) >= 0.75)
      )
        routes.push(candidate);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error("Route generation failed."));
    }
  }
  routes.sort((a, b) => b.metrics.overallScore - a.metrics.overallScore);
  return { routes: routes.slice(0, 3), errors };
}

import { describe, expect, it, vi } from "vitest";
import type { RoutingProvider } from "../providers/routing/types";
import type { NormalizedRoute } from "../types/route";
import { generateCandidates } from "./routeGeneration";

const route = (seed: number, index: number): NormalizedRoute => ({
  id: String(seed),
  seed,
  requestedStart: [18, 59],
  snappedStart: [18, 59],
  targetDistanceMeters: 5000,
  actualDistanceMeters: 5000,
  coordinates: [
    [18, 59],
    [18 + Math.cos(index * 2.1) * 0.02, 59 + Math.sin(index * 2.1) * 0.01],
    [18 + Math.cos(index * 2.1 + 1.2) * 0.025, 59 + Math.sin(index * 2.1 + 1.2) * 0.015],
    [18, 59],
  ],
  instructions: [],
  provider: "openrouteservice",
  profile: "foot-walking",
  metrics: {
    distanceErrorPercent: 0,
    closureDistanceMeters: 0,
    directedRepeatPercent: 0,
    repeatedRoutePercent: 0,
    distanceScore: 100,
    repeatScore: 100,
    closureScore: 100,
    preferenceScore: 100,
    preferenceDataCoverage: 100,
    overallScore: 100 - index,
    quality: "excellent",
    warnings: [],
  },
});

describe("candidate generation", () => {
  it("starts with exactly three calls spanning elongated and rounded shape controls", async () => {
    let index = 0;
    const provider: RoutingProvider = {
      route: vi.fn(async (request) => route(request.seed, index++)),
    };
    const result = await generateCandidates(provider, {
      start: { longitude: 18, latitude: 59 },
      targetDistanceMeters: 5000,
      mode: "mixed",
      avoidSteps: true,
      priorities: { water: false, woodland: false, unpaved: false, quiet: false },
    });
    expect(provider.route).toHaveBeenCalledTimes(3);
    expect(
      vi.mocked(provider.route).mock.calls.map(([request]) => request.roundTripPoints),
    ).toEqual([2, 3, 4]);
    expect(result.routes).toHaveLength(3);
  });
});

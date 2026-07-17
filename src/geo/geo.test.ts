import { describe, expect, it } from "vitest";
import { haversineDistance, polylineDistance } from "./distance";
import { elevationGain } from "./elevation";
import { resampleRoute } from "./resample";
import { repeatedEdges, routeSimilarity } from "./repeats";
import { scoreRoute } from "./scoring";

const stockholm: [number, number] = [18.0686, 59.3293];

const circle = (radiusMeters = 800, points = 72) =>
  Array.from({ length: points + 1 }, (_, index) => {
    const angle = (index / points) * Math.PI * 2;
    return [
      stockholm[0] +
        (Math.cos(angle) * radiusMeters) / (111320 * Math.cos((stockholm[1] * Math.PI) / 180)),
      stockholm[1] + (Math.sin(angle) * radiusMeters) / 111320,
    ] as [number, number];
  });

describe("geospatial utilities", () => {
  it("calculates realistic haversine and polyline distances", () => {
    expect(haversineDistance([18.0686, 59.3293], [18.0686, 59.3383])).toBeCloseTo(1001, -1);
    expect(
      polylineDistance([
        [18, 59],
        [18, 59.01],
        [18, 59.02],
      ]),
    ).toBeGreaterThan(2200);
  });
  it("resamples at approximately twenty metres and preserves ends", () => {
    const input: [number, number][] = [
      [18, 59],
      [18, 59.001],
    ];
    const result = resampleRoute(input);
    expect(result.length).toBeGreaterThan(5);
    expect(result[0]).toEqual(input[0]);
    expect(result.at(-1)).toEqual(input.at(-1));
  });
  it("finds little repetition in a circle and repetition in out-and-back travel", () => {
    expect(repeatedEdges(circle()).undirectedRepeatRatio).toBeLessThan(0.05);
    const outAndBack: [number, number][] = [
      [18, 59],
      [18.01, 59],
      [18.02, 59],
      [18.01, 59],
      [18, 59],
    ];
    const repeats = repeatedEdges(outAndBack);
    expect(repeats.undirectedRepeatRatio).toBeGreaterThan(0.4);
    expect(repeats.directedRepeatRatio).toBeLessThan(repeats.undirectedRepeatRatio);
  });
  it("detects the same route independent of direction", () =>
    expect(routeSimilarity(circle(), [...circle()].reverse())).toBeGreaterThan(0.95));
  it("scores a clean circular route as excellent near its target", () => {
    const route = circle();
    const metrics = scoreRoute(route, polylineDistance(route));
    expect(metrics.quality).toBe("excellent");
    expect(metrics.closureDistanceMeters).toBeLessThan(1);
    expect(metrics.overallScore).toBeGreaterThan(80);
  });
  it("returns stable warning codes for localization", () => {
    const route = circle();
    expect(scoreRoute(route, polylineDistance(route) / 2).warnings).toContain("distanceTolerance");
  });
  it("filters small elevation noise", () =>
    expect(
      elevationGain([
        [0, 0, 10],
        [0, 0, 11],
        [0, 0, 14],
        [0, 0, 10],
      ]),
    ).toEqual({ ascent: 3, descent: 4 }));
});

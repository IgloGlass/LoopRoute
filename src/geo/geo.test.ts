import { describe, expect, it } from "vitest";
import { haversineDistance, polylineDistance } from "./distance";
import { elevationGain } from "./elevation";
import { longestGreenStretchPercent, summarizeEnvironment } from "./environment";
import { resampleRoute } from "./resample";
import { repeatedEdges, routeSimilarity } from "./repeats";
import { countDecisionTurns, preferenceScore, scoreRoute } from "./scoring";
import { summarizeSurfaces } from "./surfaces";

const stockholm: [number, number] = [18.0686, 59.3293];
const noPriorities = { water: false, woodland: false, unpaved: false, quiet: false };

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
    const metrics = scoreRoute(route, polylineDistance(route), noPriorities);
    expect(metrics.quality).toBe("excellent");
    expect(metrics.closureDistanceMeters).toBeLessThan(1);
    expect(metrics.overallScore).toBeGreaterThan(80);
  });
  it("returns stable warning codes for localization", () => {
    const route = circle();
    expect(scoreRoute(route, polylineDistance(route) / 2, noPriorities).warnings).toContain(
      "distanceTolerance",
    );
  });
  it("does not reward a circle over a clean elongated loop", () => {
    const elongated = circle(800).map(([longitude, latitude]) => [
      stockholm[0] + (longitude - stockholm[0]) * 3,
      stockholm[1] + (latitude - stockholm[1]) * 0.55,
    ]) as [number, number][];
    const circleMetrics = scoreRoute(circle(), polylineDistance(circle()), noPriorities);
    const elongatedMetrics = scoreRoute(elongated, polylineDistance(elongated), noPriorities);
    expect(elongatedMetrics.overallScore).toBe(circleMetrics.overallScore);
  });
  it("weights surface segments by travelled distance instead of vertex count", () => {
    const coordinates: [number, number][] = [
      [18, 59],
      [18, 59.001],
      [18, 59.011],
    ];
    const summary = summarizeSurfaces(
      [
        [0, 1, 3],
        [1, 2, 10],
      ],
      coordinates,
    );
    expect(summary!.unpavedPercent).toBeGreaterThan(85);
  });
  it("treats missing preference evidence as neutral and reports its coverage", () => {
    expect(
      preferenceScore(
        { water: true, woodland: false, unpaved: true, quiet: false },
        { pavedPercent: 20, unpavedPercent: 80, unknownPercent: 0, dominant: "Unpaved" },
      ),
    ).toEqual({ score: 65, coverage: 50 });
  });
  it("rewards one sustained green stretch over brief green encounters", () => {
    const coordinates: [number, number][] = Array.from({ length: 6 }, (_, index) => [
      18 + index * 0.001,
      59,
    ]);
    const continuity = longestGreenStretchPercent(
      [
        [0, 2, 8],
        [2, 3, 2],
        [3, 5, 8],
      ],
      coordinates,
    );
    expect(continuity).toBeCloseTo(40, 0);
    expect(
      summarizeEnvironment(coordinates, {
        values: [
          [0, 2, 8],
          [2, 3, 2],
          [3, 5, 8],
        ],
      })?.greenContinuityPercent,
    ).toBeCloseTo(40, 0);
    const alongWater = { water: true, woodland: false, unpaved: false, quiet: false };
    expect(
      preferenceScore(alongWater, undefined, {
        greenPercent: 70,
        greenContinuityPercent: 70,
      }).score,
    ).toBeGreaterThan(
      preferenceScore(alongWater, undefined, {
        greenPercent: 70,
        greenContinuityPercent: 20,
      }).score,
    );
  });
  it("counts navigation decisions and ranks simpler routes higher", () => {
    const instruction = (type: number) => ({ text: String(type), distanceMeters: 100, type });
    expect(countDecisionTurns([0, 1, 6, 7, 8, 9, 10, 11, 12, 13].map(instruction))).toBe(6);
    const route = circle();
    const target = polylineDistance(route);
    const simple = scoreRoute(
      route,
      target,
      noPriorities,
      undefined,
      undefined,
      [0, 1].map(instruction),
    );
    const complex = scoreRoute(
      route,
      target,
      noPriorities,
      undefined,
      undefined,
      [0, 1, 2, 3, 4, 5, 7, 9, 12, 13].map(instruction),
    );
    expect(simple.turnCount).toBe(2);
    expect(complex.turnCount).toBe(10);
    expect(simple.overallScore).toBeGreaterThan(complex.overallScore);
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

import { describe, expect, it } from "vitest";
import { escapeXml, routeToGpx } from "./gpx";
import { buildShareUrl, parseShareUrl } from "./share";
import type { NormalizedRoute } from "../types/route";

const route = {
  id: "test",
  seed: 7,
  requestedStart: [18, 59],
  snappedStart: [18, 59],
  targetDistanceMeters: 5000,
  actualDistanceMeters: 5100,
  coordinates: [
    [18, 59, 5],
    [18.01, 59.01, 9],
  ],
  instructions: [],
  provider: "openrouteservice",
  profile: "foot-walking",
  metrics: {
    distanceErrorPercent: 2,
    closureDistanceMeters: 0,
    directedRepeatPercent: 0,
    repeatedRoutePercent: 0,
    compactnessScore: 80,
    distanceScore: 60,
    repeatScore: 100,
    closureScore: 100,
    overallScore: 85,
    quality: "excellent",
    warnings: [],
  },
} satisfies NormalizedRoute;

describe("GPX and sharing", () => {
  it("escapes XML and emits valid track points", () => {
    expect(escapeXml('<A&B>"')).toBe("&lt;A&amp;B&gt;&quot;");
    expect(routeToGpx(route)).toContain(
      '<trkpt lat="59.0000000" lon="18.0000000"><ele>5.0</ele></trkpt>',
    );
  });
  it("rounds shared locations by default and parses them", () => {
    const url = buildShareUrl(
      {
        start: [18.068612, 59.329323],
        distanceMeters: 5000,
        mode: "mixed",
        avoidSteps: true,
        seed: 42,
        units: "km",
      },
      false,
      "https://example.com/",
    );
    expect(url).toContain("lat=59.329");
    expect(parseShareUrl(new URL(url).search)?.seed).toBe(42);
  });
  it("rejects invalid shared inputs", () =>
    expect(
      parseShareUrl("?lat=999&lng=18&distance=5000&mode=mixed&steps=1&seed=1&units=km"),
    ).toBeUndefined());
});

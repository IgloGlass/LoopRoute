import { describe, expect, it } from "vitest";
import { buildRouteUpstream } from "./ors";
import { pointCount, validateRouteRequest } from "./validation";

const valid = {
  start: { latitude: 59.3, longitude: 18.1 },
  targetDistanceMeters: 10000,
  seed: 42,
  mode: "mixed",
  avoidSteps: true,
} as const;

describe("Cloudflare request logic", () => {
  it("accepts only exact valid input", () => {
    expect(validateRouteRequest(valid)).toEqual(valid);
    expect(validateRouteRequest({ ...valid, seed: -1 })).toBeUndefined();
    expect(validateRouteRequest({ ...valid, extra: true })).toBeUndefined();
  });
  it("rejects invalid coordinates and distances", () => {
    expect(
      validateRouteRequest({ ...valid, start: { latitude: 91, longitude: 18 } }),
    ).toBeUndefined();
    expect(validateRouteRequest({ ...valid, targetDistanceMeters: 100001 })).toBeUndefined();
  });
  it("selects bounded point counts", () => {
    expect(pointCount(3000)).toBe(5);
    expect(pointCount(10000)).toBe(7);
    expect(pointCount(20000)).toBe(9);
    expect(pointCount(40000)).toBe(12);
  });
  it("builds an allow-listed pedestrian request without a key", () => {
    const upstream = buildRouteUpstream(valid);
    expect(upstream.url).toBe(
      "https://api.openrouteservice.org/v2/directions/foot-walking/geojson",
    );
    expect(JSON.stringify(upstream)).not.toContain("key");
    expect(upstream.body.options.round_trip.length).toBe(10000);
    expect(upstream.body.options.profile_params.weightings).toEqual({
      green: 0.65,
      quiet: 0.55,
    });
  });
});

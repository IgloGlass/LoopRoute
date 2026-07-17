import { describe, expect, it } from "vitest";
import { buildRouteUpstream } from "./ors";
import { validateRouteRequest } from "./validation";

const valid = {
  start: { latitude: 59.3, longitude: 18.1 },
  targetDistanceMeters: 10000,
  seed: 42,
  mode: "mixed",
  avoidSteps: true,
  priorities: { water: true, woodland: false, unpaved: false, quiet: true },
  roundTripPoints: 3,
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
  it("rejects shape controls outside the bounded range", () => {
    expect(validateRouteRequest({ ...valid, roundTripPoints: 1 })).toBeUndefined();
    expect(validateRouteRequest({ ...valid, roundTripPoints: 7 })).toBeUndefined();
  });
  it("builds an allow-listed pedestrian request without a key", () => {
    const upstream = buildRouteUpstream(valid);
    expect(upstream.url).toBe(
      "https://api.openrouteservice.org/v2/directions/foot-walking/geojson",
    );
    expect(JSON.stringify(upstream)).not.toContain("key");
    expect(upstream.body.options.round_trip.length).toBe(10000);
    expect(upstream.body.options.round_trip.points).toBe(3);
    // Hosted ORS rejects profile weightings when combined with round trips.
    // Preference scoring remains client-side, using the requested extra data.
    expect(upstream.body.options).not.toHaveProperty("profile_params");
  });
});

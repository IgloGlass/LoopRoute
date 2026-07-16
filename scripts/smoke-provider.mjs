const baseUrl = (process.env.LOOPROUTE_BASE_URL ?? "http://127.0.0.1:8788").replace(/\/$/, "");

async function expectJson(path, init, validate) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  validate(payload);
  return payload;
}

const health = await expectJson("/api/health", undefined, (payload) => {
  if (payload?.ok !== true || payload?.routingConfigured !== true) {
    throw new Error("Routing is not configured");
  }
});

const geocoding = await expectJson(
  "/api/geocode?q=Stockholm&lat=59.3293&lng=18.0686",
  undefined,
  (payload) => {
    if (!Array.isArray(payload?.results) || payload.results.length === 0) {
      throw new Error("Geocoding returned no results");
    }
  },
);

const route = await expectJson(
  "/api/route",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: { latitude: 59.3293, longitude: 18.0686 },
      targetDistanceMeters: 3000,
      seed: 721421,
      mode: "mixed",
      avoidSteps: true,
    }),
  },
  (payload) => {
    const feature = payload?.features?.[0];
    if (payload?.type !== "FeatureCollection" || !feature?.geometry?.coordinates?.length) {
      throw new Error("Routing returned an invalid GeoJSON feature collection");
    }
  },
);

console.log(
  JSON.stringify({
    ok: health.ok,
    geocodingResults: geocoding.results.length,
    routeFeatures: route.features.length,
    routePoints: route.features[0].geometry.coordinates.length,
  }),
);

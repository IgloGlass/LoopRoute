import type { ValidRouteRequest } from "./validation";

export const ORS_HOST = "api.openrouteservice.org";

export function buildRouteUpstream(request: ValidRouteRequest) {
  const profile =
    request.mode === "trail" || request.priorities.unpaved ? "foot-hiking" : "foot-walking";
  const avoidFeatures = ["ferries", "fords", ...(request.avoidSteps ? ["steps"] : [])];
  return {
    url: `https://${ORS_HOST}/v2/directions/${profile}/geojson`,
    body: {
      coordinates: [[request.start.longitude, request.start.latitude]],
      elevation: true,
      instructions: true,
      language: "en",
      extra_info: ["surface", "waytype", "steepness", "osmid", "green", "noise"],
      options: {
        avoid_features: avoidFeatures,
        round_trip: {
          length: request.targetDistanceMeters,
          points: request.roundTripPoints,
          seed: request.seed,
        },
      },
    },
  };
}

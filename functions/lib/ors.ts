import { pointCount, type ValidRouteRequest } from "./validation";

export const ORS_HOST = "api.openrouteservice.org";

export function buildRouteUpstream(request: ValidRouteRequest) {
  const profile = request.mode === "trail" ? "foot-hiking" : "foot-walking";
  const avoidFeatures = ["ferries", "fords", ...(request.avoidSteps ? ["steps"] : [])];
  const weightings =
    request.mode === "road"
      ? { quiet: 0.25 }
      : request.mode === "mixed"
        ? { green: 0.65, quiet: 0.55 }
        : { green: 0.8 };
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
          points: pointCount(request.targetDistanceMeters),
          seed: request.seed,
        },
        profile_params: { weightings },
      },
    },
  };
}

export const MAX_SEED = 2_147_483_647;
export const MAX_BODY_BYTES = 4_096;
export type RouteMode = "road" | "mixed" | "trail";

export interface ValidRouteRequest {
  start: { latitude: number; longitude: number };
  targetDistanceMeters: number;
  seed: number;
  mode: RouteMode;
  avoidSteps: boolean;
}

const exactKeys = (value: Record<string, unknown>, expected: string[]) => {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index])
  );
};

export function validateRouteRequest(input: unknown): ValidRouteRequest | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  if (!exactKeys(value, ["start", "targetDistanceMeters", "seed", "mode", "avoidSteps"]))
    return undefined;
  const start = value.start as Record<string, unknown>;
  if (
    !start ||
    typeof start !== "object" ||
    Array.isArray(start) ||
    !exactKeys(start, ["latitude", "longitude"])
  )
    return undefined;
  const latitude = start.latitude;
  const longitude = start.longitude;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  )
    return undefined;
  if (
    typeof value.targetDistanceMeters !== "number" ||
    !Number.isFinite(value.targetDistanceMeters) ||
    value.targetDistanceMeters < 1_000 ||
    value.targetDistanceMeters > 100_000
  )
    return undefined;
  if (
    typeof value.seed !== "number" ||
    !Number.isSafeInteger(value.seed) ||
    value.seed <= 0 ||
    value.seed > MAX_SEED
  )
    return undefined;
  if (
    !["road", "mixed", "trail"].includes(String(value.mode)) ||
    typeof value.avoidSteps !== "boolean"
  )
    return undefined;
  return {
    start: { latitude, longitude },
    targetDistanceMeters: value.targetDistanceMeters,
    seed: value.seed,
    mode: value.mode as RouteMode,
    avoidSteps: value.avoidSteps,
  };
}

export const validCoordinate = (
  value: string | null,
  min: number,
  max: number,
): number | undefined => {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
};

export function pointCount(distanceMeters: number): number {
  if (distanceMeters < 8_000) return 5;
  if (distanceMeters < 15_000) return 7;
  if (distanceMeters < 30_000) return 9;
  return 12;
}

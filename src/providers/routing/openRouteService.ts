import { elevationGain } from "../../geo/elevation";
import { summarizeEnvironment } from "../../geo/environment";
import { polylineDistance } from "../../geo/distance";
import { scoreRoute } from "../../geo/scoring";
import { summarizeSurfaces } from "../../geo/surfaces";
import type { ExtraSummaryItem } from "../../geo/surfaces";
import type {
  Coordinate,
  NormalizedRoute,
  RouteInstruction,
  RouteRequest,
} from "../../types/route";
import type { RoutingProvider } from "./types";

interface OrsFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    summary?: { distance?: number; ascent?: number; descent?: number };
    segments?: Array<{ steps?: Array<{ instruction?: string; distance?: number; type?: number }> }>;
    extras?: {
      surface?: { values?: Array<[number, number, number]>; summary?: ExtraSummaryItem[] };
      green?: { values?: Array<[number, number, number]>; summary?: ExtraSummaryItem[] };
      noise?: { values?: Array<[number, number, number]>; summary?: ExtraSummaryItem[] };
    };
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function normalizeOrsResponse(data: unknown, request: RouteRequest): NormalizedRoute {
  const feature = (data as { features?: OrsFeature[] })?.features?.[0];
  if (
    !feature ||
    feature.geometry?.type !== "LineString" ||
    !Array.isArray(feature.geometry.coordinates)
  )
    throw new ApiError("The routing provider returned invalid route geometry.", 502);
  const coordinates = feature.geometry.coordinates.filter(
    (coordinate): coordinate is Coordinate =>
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      coordinate.slice(0, 3).every(Number.isFinite),
  );
  if (coordinates.length < 2)
    throw new ApiError("The routing provider returned an empty route.", 502);
  const actualDistanceMeters =
    feature.properties?.summary?.distance ?? polylineDistance(coordinates);
  const calculatedElevation = elevationGain(coordinates);
  const instructions: RouteInstruction[] = (feature.properties?.segments ?? []).flatMap((segment) =>
    (segment.steps ?? []).map((step) => ({
      text: step.instruction || "Continue",
      distanceMeters: step.distance ?? 0,
      type: step.type,
    })),
  );
  const extras = feature.properties?.extras;
  const surfaceSummary = summarizeSurfaces(
    extras?.surface?.values,
    coordinates,
    extras?.surface?.summary,
  );
  const environmentSummary = summarizeEnvironment(coordinates, extras?.green, extras?.noise);
  return {
    id: `ors-${request.seed}-${Math.round(actualDistanceMeters)}`,
    seed: request.seed,
    requestedStart: [request.start.longitude, request.start.latitude],
    snappedStart: [coordinates[0][0], coordinates[0][1]],
    targetDistanceMeters: request.targetDistanceMeters,
    actualDistanceMeters,
    ascentMeters: feature.properties?.summary?.ascent ?? calculatedElevation.ascent,
    descentMeters: feature.properties?.summary?.descent ?? calculatedElevation.descent,
    coordinates,
    instructions,
    surfaceSummary,
    environmentSummary,
    provider: "openrouteservice",
    profile:
      request.mode === "trail" || request.priorities.unpaved ? "foot-hiking" : "foot-walking",
    metrics: scoreRoute(
      coordinates,
      request.targetDistanceMeters,
      request.priorities,
      surfaceSummary,
      environmentSummary,
    ),
  };
}

export class OpenRouteServiceRoutingProvider implements RoutingProvider {
  async route(request: RouteRequest, signal?: AbortSignal): Promise<NormalizedRoute> {
    const response = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    const data = await response.json().catch(() => undefined);
    if (!response.ok)
      throw new ApiError(
        (data as { error?: string })?.error || "Route generation failed.",
        response.status,
      );
    return normalizeOrsResponse(data, request);
  }
}

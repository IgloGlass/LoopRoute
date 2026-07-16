/// <reference types="@cloudflare/workers-types" />
import { json, safeUpstreamError } from "../lib/responses";
import { ORS_HOST } from "../lib/ors";
import { validCoordinate } from "../lib/validation";

interface Env {
  ORS_API_KEY?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "GET")
    return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
  if (!env.ORS_API_KEY)
    return json({ error: "Place search is not configured on this deployment." }, 503);
  const incoming = new URL(request.url);
  const query = (incoming.searchParams.get("q") ?? "").trim();
  if (query.length < 3 || query.length > 200)
    return json({ error: "Search text must be between 3 and 200 characters." }, 400);
  const latParam = incoming.searchParams.get("lat");
  const lngParam = incoming.searchParams.get("lng");
  const lat = validCoordinate(latParam, -90, 90);
  const lng = validCoordinate(lngParam, -180, 180);
  if ((latParam !== null || lngParam !== null) && (lat === undefined || lng === undefined))
    return json({ error: "Search focus coordinates are invalid." }, 400);
  const upstream = new URL(`https://${ORS_HOST}/geocode/search`);
  upstream.searchParams.set("text", query);
  upstream.searchParams.set("size", "5");
  if (lat !== undefined && lng !== undefined) {
    upstream.searchParams.set("focus.point.lat", String(lat));
    upstream.searchParams.set("focus.point.lon", String(lng));
  }
  try {
    const response = await fetch(upstream, {
      headers: { Authorization: env.ORS_API_KEY, Accept: "application/json" },
    });
    if (!response.ok) return safeUpstreamError(response.status);
    const data = (await response.json()) as {
      features?: Array<{
        properties?: Record<string, unknown>;
        geometry?: { coordinates?: number[] };
      }>;
    };
    const results = (data.features ?? []).slice(0, 5).flatMap((feature, index) => {
      const coordinate = feature.geometry?.coordinates;
      const properties = feature.properties ?? {};
      return Array.isArray(coordinate) && coordinate.length >= 2
        ? [
            {
              id: String(properties.id ?? `${index}-${coordinate.join("-")}`),
              label: String(properties.label ?? properties.name ?? "Result"),
              locality: properties.locality,
              region: properties.region,
              country: properties.country,
              latitude: coordinate[1],
              longitude: coordinate[0],
            },
          ]
        : [];
    });
    return json({ results });
  } catch {
    return json({ error: "The place search provider could not be reached." }, 502);
  }
};

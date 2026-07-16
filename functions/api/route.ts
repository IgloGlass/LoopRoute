/// <reference types="@cloudflare/workers-types" />
import { buildRouteUpstream } from "../lib/ors";
import { json, safeUpstreamError } from "../lib/responses";
import { MAX_BODY_BYTES, validateRouteRequest } from "../lib/validation";

interface Env {
  ORS_API_KEY?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST")
    return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return json({ error: "Content-Type must be application/json." }, 415);
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BODY_BYTES) return json({ error: "Request body is too large." }, 413);
  if (!env.ORS_API_KEY)
    return json({ error: "Routing is not configured on this deployment." }, 503);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES)
    return json({ error: "Request body is too large." }, 413);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return json({ error: "Request body is not valid JSON." }, 400);
  }
  const validated = validateRouteRequest(input);
  if (!validated) return json({ error: "Route request is invalid." }, 400);
  const upstream = buildRouteUpstream(validated);
  try {
    const response = await fetch(upstream.url, {
      method: "POST",
      headers: {
        Authorization: env.ORS_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/geo+json",
      },
      body: JSON.stringify(upstream.body),
    });
    if (!response.ok) return safeUpstreamError(response.status);
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return json({ error: "The routing provider could not be reached." }, 502);
  }
};

/// <reference types="@cloudflare/workers-types" />
import { json } from "../lib/responses";

interface Env {
  ORS_API_KEY?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "GET")
    return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
  return json({ ok: true, routingConfigured: Boolean(env.ORS_API_KEY) });
};

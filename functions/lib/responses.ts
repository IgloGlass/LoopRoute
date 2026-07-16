export const json = (body: unknown, status = 200, extraHeaders: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

export function safeUpstreamError(status: number): Response {
  if (status === 401 || status === 403)
    return json({ error: "Routing service authentication failed. Check the server API key." }, 503);
  if (status === 429)
    return json(
      { error: "The free routing quota is busy or exhausted. Please try again later." },
      429,
      { "Retry-After": "60" },
    );
  if (status >= 500)
    return json({ error: "The routing provider is temporarily unavailable." }, 502);
  return json(
    { error: "No suitable route could be generated for these settings." },
    status >= 400 && status < 500 ? status : 502,
  );
}

# LoopRoute project conventions

- Keep `LoopRoute` centralized in `src/config/app.ts`; do not scatter product-name constants.
- Keep all precise-position API traffic same-origin. Frontend code must never reference an openrouteservice key or contact openrouteservice directly.
- Cloudflare Functions validate and proxy only. Geometry normalization, resampling, repeat analysis, similarity, ranking, GPX, sharing, and persistence belong in the browser.
- Preserve the provider interfaces under `src/providers/` when adding routing, geocoding, or map providers.
- Internal distance values are metres and coordinates are `[longitude, latitude]`. Convert only for display.
- Route generation starts with exactly three calls and permits at most two bounded replacements. “Generate another” makes exactly one call.
- Never cache `/api/route` or `/api/geocode`, log coordinates/search text, or persist live-follow history.
- Put English and Swedish UI strings in the typed dictionaries under `src/i18n/`; do not add untranslated component strings.
- Maintain accessible non-map route information, 44 px touch targets, visible focus, safe-area support, and the 375 px mobile layout.
- Add or update pure tests for geometry, validation, sharing, storage, and GPX behavior. Provider-dependent E2E tests must mock `/api/*`.
- Before handoff, run `npm run format`, `npm run verify`, and `npm run test:e2e`, then smoke-test the production preview.

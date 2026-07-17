# Route generation and ranking

LoopRoute treats route generation as constrained multi-objective search. The hard goals are target
distance, a closed loop, and little repeated travel. Surface and environmental priorities are soft
goals because their quality depends on OpenStreetMap coverage.

## Candidate portfolio

An initial search starts exactly three same-origin routing calls. The calls use two, three, and four
round-trip control points. This deliberately samples elongated and moderately rounded loops; it does
not increase control points with route length. openrouteservice documents that larger point counts
produce more circular routes, so using a large distance-based count would introduce a shape bias.

If fewer than three distinct usable candidates return, or fewer than three avoid compromised
quality, the browser can make at most two bounded replacement calls. From the resulting pool it uses
greedy diversity selection. The first route has the best quality score; each later choice maximizes:

`quality score - 30 × maximum similarity to an already selected route`

“Generate another” always makes exactly one call. A distinct result is appended rather than
replacing one of the first three, so exploration can continue without changing route identities.

## Shape-neutral quality score

Let `e` be absolute distance error in percent, `u` undirected repeated-route percent, `d` directed
repeat percent, and `c` the closure gap in metres.

- `distance = 100 × exp(-0.5 × (e / 4)²)`
- `repeat = clamp(100 - 2.5u - 0.75d)`
- `closure = clamp(100 - 1.5 × max(0, c - 10))`
- `preference` is the mean of available evidence for requested priorities
- `overall = 0.32 distance + 0.33 repeat + 0.10 closure + 0.25 preference`

There is intentionally no compactness, radial variance, aspect-ratio, enclosed-area, or circularity
term. Two equally long, equally closed, non-repeating routes with equal preference evidence receive
the same score even if one is circular and the other is a long oval.

## Preference evidence

- Near water and woodland both strengthen the provider's `green` weighting. Its green evidence is
  derived from trees, parks, and rivers, so the UI describes this as map-data-dependent rather than
  claiming exact land-cover classification.
- Quiet uses the provider's quiet weighting and distance-weighted noise evidence.
- Unpaved selects the hiking pedestrian profile and ranks returned routes by distance-weighted
  surface evidence.

Provider extra-info ranges are geometry indices, not metres. LoopRoute converts each range to actual
geodesic segment distance before calculating percentages. If the provider includes its own distance
summary, that summary is preferred. Missing evidence is reported as missing coverage and receives a
neutral score rather than being presented as a verified match.

Provider reference: [openrouteservice routing options](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options),
[openrouteservice extra info](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/).

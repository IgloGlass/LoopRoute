import type { NormalizedRoute, RouteRequest } from "../../types/route";

export interface RoutingProvider {
  route(request: RouteRequest, signal?: AbortSignal): Promise<NormalizedRoute>;
}

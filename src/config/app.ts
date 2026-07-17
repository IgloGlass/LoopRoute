export const APP_NAME = "LoopRoute";
export const STORAGE_KEY = "looproute:v1";
export const STORAGE_VERSION = 1;
export const DEFAULT_CENTER: [number, number] = [18.0686, 59.3293];
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const DESKTOP_BREAKPOINT = 700;
export const DISTANCE_PRESETS = [3000, 5000, 7500, 10000, 15000, 21097.5, 30000, 42195];
export const MAX_RESAMPLED_POINTS = 12_000;

export const routeLabel = (index: number): string => {
  let value = Math.max(0, Math.floor(index));
  let label = "";
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
};

export type RouteMode = "road" | "mixed" | "trail";
export type DisplayUnits = "km" | "mi";
export type Theme = "light" | "dark" | "system";
export type Language = "en" | "sv";

export interface RoutePriorities {
  water: boolean;
  woodland: boolean;
  unpaved: boolean;
  quiet: boolean;
}

export const DEFAULT_ROUTE_PRIORITIES: RoutePriorities = {
  water: false,
  woodland: false,
  unpaved: false,
  quiet: false,
};

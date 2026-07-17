import type { DisplayUnits, RouteMode } from "../config/app";

export interface SharePlan {
  start: [number, number];
  distanceMeters: number;
  mode: RouteMode;
  avoidSteps: boolean;
  seed: number;
  units: DisplayUnits;
}

export function buildShareUrl(
  plan: SharePlan,
  precise = false,
  base = window.location.origin + window.location.pathname,
): string {
  const url = new URL(base);
  const digits = precise ? 6 : 3;
  url.searchParams.set("lat", plan.start[1].toFixed(digits));
  url.searchParams.set("lng", plan.start[0].toFixed(digits));
  url.searchParams.set("distance", String(Math.round(plan.distanceMeters)));
  url.searchParams.set("mode", plan.mode);
  url.searchParams.set("steps", plan.avoidSteps ? "1" : "0");
  url.searchParams.set("seed", String(plan.seed));
  url.searchParams.set("units", plan.units);
  if (precise) url.searchParams.set("precise", "1");
  return url.toString();
}

export function parseShareUrl(search: string): SharePlan | undefined {
  const params = new URLSearchParams(search);
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const distanceMeters = Number(params.get("distance"));
  const seed = Number(params.get("seed"));
  const mode = params.get("mode");
  const units = params.get("units");
  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180 ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 1000 ||
    distanceMeters > 100000 ||
    !Number.isSafeInteger(seed) ||
    seed <= 0 ||
    !["road", "mixed", "trail"].includes(mode ?? "") ||
    !["km", "mi"].includes(units ?? "")
  )
    return undefined;
  return {
    start: [lng, lat],
    distanceMeters,
    seed,
    mode: mode as RouteMode,
    avoidSteps: params.get("steps") === "1",
    units: units as DisplayUnits,
  };
}

export async function sharePlan(url: string): Promise<"shared" | "copied"> {
  if (navigator.share) {
    try {
      await navigator.share({ title: `${APP_NAME} running route`, url });
      return "shared";
    } catch {
      // A dismissed or unsupported native share sheet falls back to a copyable link.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const input = document.createElement("textarea");
    input.value = url;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  return "copied";
}
import { APP_NAME } from "../config/app";

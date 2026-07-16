import {
  STORAGE_KEY,
  STORAGE_VERSION,
  type DisplayUnits,
  type Language,
  type RouteMode,
  type Theme,
} from "../config/app";
import type { NormalizedRoute } from "../types/route";

export interface Preferences {
  units: DisplayUnits;
  theme: Theme;
  language: Language;
  paceSecondsPerKm: number;
  mode: RouteMode;
  avoidSteps: boolean;
}

export interface StoredState {
  version: 1;
  preferences: Preferences;
  lastStart?: [number, number];
  selectedRoute?: NormalizedRoute;
  safetyDismissed?: boolean;
}

const metricByLocale = () => !/^(en-US|en-LR|my)/i.test(navigator.language);

export function defaultPreferences(): Preferences {
  return {
    units: metricByLocale() ? "km" : "mi",
    theme: "system",
    language: navigator.language.toLowerCase().startsWith("sv") ? "sv" : "en",
    paceSecondsPerKm: 360,
    mode: "mixed",
    avoidSteps: true,
  };
}

export function loadState(): StoredState {
  const fallback: StoredState = { version: STORAGE_VERSION, preferences: defaultPreferences() };
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<StoredState> | null;
    if (!parsed || parsed.version !== STORAGE_VERSION || !parsed.preferences) return fallback;
    return {
      ...fallback,
      ...parsed,
      preferences: { ...fallback.preferences, ...parsed.preferences },
    };
  } catch {
    return fallback;
  }
}

export function saveState(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage can be disabled */
  }
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

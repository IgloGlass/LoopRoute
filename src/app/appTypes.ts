import type { NormalizedRoute } from "../types/route";

export type AppStage =
  "locating" | "ready" | "generating" | "results" | "following" | "offline" | "error";

export interface AppState {
  stage: AppStage;
  start?: [number, number];
  accuracy?: number;
  candidates: NormalizedRoute[];
  selectedId?: string;
  error?: string;
  requestId: number;
  locationMessage?: string;
}

export type AppAction =
  | { type: "START_READY"; start: [number, number]; accuracy?: number; message?: string }
  | { type: "LOCATION_FAILED"; message: string; fallback?: [number, number] }
  | { type: "START_CHANGED"; start: [number, number]; message?: string }
  | { type: "GENERATING"; requestId: number }
  | { type: "RESULTS"; requestId: number; candidates: NormalizedRoute[]; error?: string }
  | { type: "SELECT"; id: string }
  | { type: "FOLLOW" }
  | { type: "STOP_FOLLOW" }
  | { type: "OFFLINE" }
  | { type: "ONLINE" }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR" };

export const initialAppState: AppState = { stage: "locating", candidates: [], requestId: 0 };

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "START_READY":
      return {
        ...state,
        stage: "ready",
        start: action.start,
        accuracy: action.accuracy,
        locationMessage: action.message,
        error: undefined,
      };
    case "LOCATION_FAILED":
      return { ...state, stage: "ready", start: action.fallback, locationMessage: action.message };
    case "START_CHANGED":
      return {
        ...state,
        stage: "ready",
        start: action.start,
        candidates: [],
        selectedId: undefined,
        error: undefined,
        locationMessage: action.message,
      };
    case "GENERATING":
      return {
        ...state,
        stage: "generating",
        requestId: action.requestId,
        candidates: [],
        selectedId: undefined,
        error: undefined,
      };
    case "RESULTS":
      return action.requestId !== state.requestId
        ? state
        : {
            ...state,
            stage: action.candidates.length ? "results" : "error",
            candidates: action.candidates,
            selectedId: action.candidates[0]?.id,
            error: action.error,
          };
    case "SELECT":
      return { ...state, stage: "results", selectedId: action.id };
    case "FOLLOW":
      return { ...state, stage: "following" };
    case "STOP_FOLLOW":
      return { ...state, stage: "results" };
    case "OFFLINE":
      return { ...state, stage: "offline" };
    case "ONLINE":
      return { ...state, stage: state.candidates.length ? "results" : "ready" };
    case "ERROR":
      return { ...state, stage: "error", error: action.message };
    case "CLEAR":
      return {
        ...state,
        stage: state.start ? "ready" : "error",
        candidates: [],
        selectedId: undefined,
        error: state.start ? undefined : "Choose a start point.",
      };
  }
}

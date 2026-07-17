import type { RouteMode } from "../config/app";

export type Coordinate = [number, number] | [number, number, number];

export interface RouteInstruction {
  text: string;
  distanceMeters: number;
  type?: number;
}

export interface SurfaceSummary {
  pavedPercent: number;
  unpavedPercent: number;
  unknownPercent: number;
  dominant: string;
}

export interface RepeatMetrics {
  directedRepeatMeters: number;
  directedRepeatRatio: number;
  undirectedRepeatMeters: number;
  undirectedRepeatRatio: number;
  undirectedEdges: Set<string>;
}

export type RouteWarning = "distanceTolerance" | "highRepetition" | "outAndBack" | "openLoop";

export interface RouteMetrics {
  distanceErrorPercent: number;
  closureDistanceMeters: number;
  directedRepeatPercent: number;
  repeatedRoutePercent: number;
  compactnessScore: number;
  distanceScore: number;
  repeatScore: number;
  closureScore: number;
  overallScore: number;
  quality: "excellent" | "good" | "compromised";
  warnings: RouteWarning[];
}

export interface NormalizedRoute {
  id: string;
  seed: number;
  requestedStart: [number, number];
  snappedStart: [number, number];
  targetDistanceMeters: number;
  actualDistanceMeters: number;
  durationSeconds?: number;
  ascentMeters?: number;
  descentMeters?: number;
  coordinates: Coordinate[];
  instructions: RouteInstruction[];
  surfaceSummary?: SurfaceSummary;
  provider: "openrouteservice";
  profile: "foot-walking" | "foot-hiking";
  metrics: RouteMetrics;
}

export interface RouteRequest {
  start: { latitude: number; longitude: number };
  targetDistanceMeters: number;
  seed: number;
  mode: RouteMode;
  avoidSteps: boolean;
}

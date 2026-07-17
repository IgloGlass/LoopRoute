import type { Coordinate, EnvironmentSummary } from "../types/route";
import { haversineDistance, polylineDistance } from "./distance";
import { extraDistances, type ExtraSummaryItem } from "./surfaces";

const CONTINUOUS_GREEN_THRESHOLD = 6;

const weightedPercent = (
  values: Array<[number, number, number]> | undefined,
  coordinates: Coordinate[],
  summary?: ExtraSummaryItem[],
) => {
  const distances = extraDistances(values, coordinates, summary);
  const total = [...distances.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return undefined;
  const average = [...distances].reduce(
    (sum, [category, distance]) => sum + Math.max(0, Math.min(10, category)) * distance,
    0,
  );
  return (average / total) * 10;
};

export const longestGreenStretchPercent = (
  values: Array<[number, number, number]> | undefined,
  coordinates: Coordinate[],
): number | undefined => {
  if (!values?.length) return undefined;
  const totalDistance = polylineDistance(coordinates);
  if (totalDistance <= 0) return undefined;
  let currentDistance = 0;
  let longestDistance = 0;
  let previousEnd: number | undefined;
  for (const [rawStart, rawEnd, greenValue] of values) {
    const start = Math.max(0, Math.floor(rawStart));
    const end = Math.min(coordinates.length - 1, Math.floor(rawEnd));
    let sectionDistance = 0;
    for (let index = start; index < end; index += 1)
      sectionDistance += haversineDistance(coordinates[index], coordinates[index + 1]);
    if (greenValue >= CONTINUOUS_GREEN_THRESHOLD) {
      currentDistance = previousEnd === start ? currentDistance + sectionDistance : sectionDistance;
      longestDistance = Math.max(longestDistance, currentDistance);
    } else {
      currentDistance = 0;
    }
    previousEnd = end;
  }
  return Math.min(100, (longestDistance / totalDistance) * 100);
};

export function summarizeEnvironment(
  coordinates: Coordinate[],
  green?: { values?: Array<[number, number, number]>; summary?: ExtraSummaryItem[] },
  noise?: { values?: Array<[number, number, number]>; summary?: ExtraSummaryItem[] },
): EnvironmentSummary | undefined {
  const greenPercent = weightedPercent(green?.values, coordinates, green?.summary);
  const noisePercent = weightedPercent(noise?.values, coordinates, noise?.summary);
  if (greenPercent === undefined && noisePercent === undefined) return undefined;
  return {
    greenPercent,
    greenContinuityPercent: longestGreenStretchPercent(green?.values, coordinates),
    quietPercent: noisePercent === undefined ? undefined : 100 - noisePercent,
  };
}

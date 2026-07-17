import type { Coordinate, EnvironmentSummary } from "../types/route";
import { extraDistances, type ExtraSummaryItem } from "./surfaces";

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
    quietPercent: noisePercent === undefined ? undefined : 100 - noisePercent,
  };
}

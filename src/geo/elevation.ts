import type { Coordinate } from "../types/route";

export function elevationGain(
  coordinates: Coordinate[],
  noiseThreshold = 2,
): { ascent: number; descent: number } {
  let ascent = 0;
  let descent = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    if (coordinates[index - 1].length < 3 || coordinates[index].length < 3) continue;
    const delta = (coordinates[index][2] ?? 0) - (coordinates[index - 1][2] ?? 0);
    if (delta >= noiseThreshold) ascent += delta;
    if (delta <= -noiseThreshold) descent += Math.abs(delta);
  }
  return { ascent, descent };
}

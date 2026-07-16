import type { Coordinate } from "../../types/route";

export function ElevationProfile({ coordinates }: { coordinates: Coordinate[] }) {
  const values = coordinates
    .filter((coordinate) => coordinate.length > 2)
    .map((coordinate) => coordinate[2] ?? 0);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const path = values
    .map(
      (value, index) =>
        `${index ? "L" : "M"} ${(index / (values.length - 1)) * 300} ${70 - ((value - min) / range) * 58}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 300 76"
      role="img"
      aria-label={`Elevation profile from ${Math.round(min)} to ${Math.round(max)} metres`}
      className="elevation-profile"
    >
      <path d={`${path} L 300 76 L 0 76 Z`} className="elevation-fill" />
      <path d={path} className="elevation-line" />
    </svg>
  );
}

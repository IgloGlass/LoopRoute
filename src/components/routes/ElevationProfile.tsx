import type { DisplayUnits, Language } from "../../config/app";
import { t } from "../../i18n";
import type { Coordinate } from "../../types/route";

export function ElevationProfile({
  coordinates,
  units,
  language,
}: {
  coordinates: Coordinate[];
  units: DisplayUnits;
  language: Language;
}) {
  const values = coordinates
    .filter((coordinate) => coordinate.length > 2)
    .map((coordinate) => coordinate[2] ?? 0);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const elevationFactor = units === "mi" ? 3.28084 : 1;
  const elevationUnit = units === "mi" ? "ft" : "m";
  const path = values
    .map(
      (value, index) =>
        `${index ? "L" : "M"} ${(index / (values.length - 1)) * 300} ${70 - ((value - min) / range) * 58}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 300 90"
      role="img"
      aria-label={`${t(language, "elevationProfile")}: ${Math.round(min * elevationFactor)}–${Math.round(max * elevationFactor)} ${elevationUnit}`}
      className="elevation-profile"
    >
      <path d={`${path} L 300 76 L 0 76 Z`} className="elevation-fill" />
      <path d={path} className="elevation-line" />
      <text x="4" y="87" className="elevation-label" aria-hidden="true">
        {Math.round(min * elevationFactor)} {elevationUnit}
      </text>
      <text x="296" y="87" textAnchor="end" className="elevation-label" aria-hidden="true">
        {Math.round(max * elevationFactor)} {elevationUnit}
      </text>
    </svg>
  );
}

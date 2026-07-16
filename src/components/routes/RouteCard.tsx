import { AlertTriangle, ArrowUpRight, Footprints, Mountain, Timer } from "lucide-react";
import type { DisplayUnits, Language } from "../../config/app";
import { t } from "../../i18n";
import type { NormalizedRoute } from "../../types/route";

const distance = (meters: number, units: DisplayUnits, language: Language) =>
  new Intl.NumberFormat(language === "sv" ? "sv-SE" : "en", {
    maximumFractionDigits: 1,
    minimumFractionDigits: meters < 10_000 ? 1 : 0,
  }).format(units === "mi" ? meters / 1609.344 : meters / 1000);
const duration = (meters: number, paceSecondsPerKm: number) => {
  const total = Math.round((meters / 1000) * paceSecondsPerKm);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes} min`;
};

export function RouteCard({
  route,
  index,
  selected,
  units,
  language,
  paceSecondsPerKm,
  onSelect,
}: {
  route: NormalizedRoute;
  index: number;
  selected: boolean;
  units: DisplayUnits;
  language: Language;
  paceSecondsPerKm: number;
  onSelect: () => void;
}) {
  const diff =
    ((route.actualDistanceMeters - route.targetDistanceMeters) / route.targetDistanceMeters) * 100;
  const quality = t(language, route.metrics.quality);
  return (
    <button
      className={`route-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${t(language, "route")} ${String.fromCharCode(65 + index)}, ${distance(route.actualDistanceMeters, units, language)} ${units}`}
    >
      <span
        className="route-stripe"
        style={{ "--route-color": ["#f05d3a", "#176f67", "#75538c"][index] } as React.CSSProperties}
      />
      <span className="route-card-head">
        <span className="route-name">
          {t(language, "route")} {String.fromCharCode(65 + index)}
        </span>
        <span className={`quality ${route.metrics.quality}`}>{quality}</span>
        <span
          className="score-ring"
          aria-label={`${t(language, "score")} ${route.metrics.overallScore}`}
        >
          {route.metrics.overallScore}
        </span>
      </span>
      <span className="route-distance">
        {distance(route.actualDistanceMeters, units, language)} <small>{units}</small>
      </span>
      <span className="route-diff">
        <ArrowUpRight size={14} aria-hidden /> {diff >= 0 ? "+" : ""}
        {diff.toFixed(1)}% {t(language, "difference")}
      </span>
      <span className="route-metrics">
        <span>
          <Timer size={16} />
          {duration(route.actualDistanceMeters, paceSecondsPerKm)}
        </span>
        <span>
          <Mountain size={16} />
          {route.ascentMeters === undefined ? "—" : `${Math.round(route.ascentMeters)} m`}
        </span>
        <span>
          <Footprints size={16} />
          {route.metrics.repeatedRoutePercent.toFixed(0)}%
        </span>
      </span>
      <span className="surface-line">
        {route.surfaceSummary
          ? `${Math.round(route.surfaceSummary.pavedPercent)}% ${t(language, "paved")} · ${Math.round(route.surfaceSummary.unpavedPercent)}% ${t(language, "unpaved")}`
          : `${t(language, "surface")}: ${t(language, "unknown")}`}
      </span>
      {route.metrics.warnings.length > 0 && (
        <span className="warning-line">
          <AlertTriangle size={15} />
          {route.metrics.warnings[0]}
        </span>
      )}
    </button>
  );
}

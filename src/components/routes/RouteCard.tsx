import { AlertTriangle, ArrowUpRight, Footprints, Leaf, Mountain, Timer } from "lucide-react";
import { ROUTE_COLORS, routeLabel, type DisplayUnits, type Language } from "../../config/app";
import { routeWarningText, t } from "../../i18n";
import type { NormalizedRoute } from "../../types/route";

const distance = (meters: number, units: DisplayUnits, language: Language) =>
  new Intl.NumberFormat(language === "sv" ? "sv-SE" : "en", {
    maximumFractionDigits: 1,
    minimumFractionDigits: meters < 10_000 ? 1 : 0,
  }).format(units === "mi" ? meters / 1609.344 : meters / 1000);
const duration = (meters: number, paceSecondsPerKm: number, language: Language) => {
  const total = Math.round((meters / 1000) * paceSecondsPerKm);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return hours
    ? `${hours} ${t(language, "hourShort")} ${minutes} ${t(language, "minuteShort")}`
    : `${minutes} ${t(language, "minuteShort")}`;
};

export function RouteCard({
  route,
  index,
  selected,
  best,
  units,
  language,
  paceSecondsPerKm,
  showPreferenceMatch,
  onSelect,
}: {
  route: NormalizedRoute;
  index: number;
  selected: boolean;
  best: boolean;
  units: DisplayUnits;
  language: Language;
  paceSecondsPerKm: number;
  showPreferenceMatch: boolean;
  onSelect: () => void;
}) {
  const differenceMeters = route.actualDistanceMeters - route.targetDistanceMeters;
  const differenceCopy =
    Math.abs(differenceMeters) < 50
      ? t(language, "onTarget")
      : `${distance(Math.abs(differenceMeters), units, language)} ${units} ${t(
          language,
          differenceMeters > 0 ? "longerThanTarget" : "shorterThanTarget",
        )}`;
  const quality = t(language, route.metrics.quality);
  const preferenceCoverage = route.metrics.preferenceDataCoverage ?? 0;
  const preferenceMatch = route.metrics.preferenceScore ?? 50;
  const titleId = `route-option-${index}-title`;
  const descriptionId = `route-option-${index}-description`;
  const estimatedDuration = duration(route.actualDistanceMeters, paceSecondsPerKm, language);
  const elevation =
    route.ascentMeters === undefined
      ? t(language, "unknown")
      : units === "mi"
        ? `${Math.round(route.ascentMeters * 3.28084)} ft`
        : `${Math.round(route.ascentMeters)} m`;
  const accessibleSummary = [
    `${distance(route.actualDistanceMeters, units, language)} ${units}`,
    differenceCopy,
    `${t(language, "estimatedTime")}: ${estimatedDuration}`,
    `${t(language, "elevation")}: ${elevation}`,
    `${t(language, "repeated")}: ${route.metrics.repeatedRoutePercent.toFixed(0)}%`,
    route.metrics.warnings[0] ? routeWarningText(language, route.metrics.warnings[0]) : undefined,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <button
      className={`route-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={selected ? 0 : -1}
      onKeyDown={(event) => {
        if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const options = [
          ...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
            '[role="radio"]',
          ) ?? []),
        ];
        if (!options.length) return;
        const current = options.indexOf(event.currentTarget);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : (current +
                  (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) +
                  options.length) %
                options.length;
        options[next].focus();
        options[next].click();
      }}
      style={{ "--route-color": ROUTE_COLORS[index % ROUTE_COLORS.length] } as React.CSSProperties}
    >
      <span id={descriptionId} className="sr-only">
        {accessibleSummary}
      </span>
      <span className="route-stripe" />
      <span className="route-card-head">
        <span id={titleId} className="route-name">
          {t(language, "route")} {routeLabel(index)}
        </span>
        <span className={`quality ${route.metrics.quality}`}>{quality}</span>
        {best && <span className="best-match">{t(language, "bestMatch")}</span>}
      </span>
      <span className="route-distance">
        {distance(route.actualDistanceMeters, units, language)} <small>{units}</small>
      </span>
      <span className="route-diff">
        <ArrowUpRight
          size={14}
          aria-hidden
          className={differenceMeters < 0 ? "difference-under" : ""}
        />
        {differenceCopy}
      </span>
      <span className="route-metrics">
        <span>
          <Timer size={16} />
          {estimatedDuration}
        </span>
        <span>
          <Mountain size={16} />
          {route.ascentMeters === undefined ? "—" : elevation}
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
      {showPreferenceMatch && (
        <span className="preference-line">
          <Leaf size={14} />
          {preferenceCoverage
            ? `${t(language, "preferenceMatch")} ${preferenceMatch}%`
            : t(language, "preferenceDataLimited")}
        </span>
      )}
      {route.metrics.warnings.length > 0 && (
        <span className="warning-line">
          <AlertTriangle size={15} />
          {routeWarningText(language, route.metrics.warnings[0])}
        </span>
      )}
    </button>
  );
}

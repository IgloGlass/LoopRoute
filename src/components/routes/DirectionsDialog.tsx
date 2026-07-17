import { Menu, X } from "lucide-react";
import { useRef } from "react";
import type { DisplayUnits, Language } from "../../config/app";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { t } from "../../i18n";
import type { NormalizedRoute } from "../../types/route";

const formatDistance = (meters: number, units: DisplayUnits, language: Language) => {
  if (units === "mi" && meters < 160.9344) return `${Math.round(meters * 3.28084)} ft`;
  if (units === "km" && meters < 1000) return `${Math.round(meters)} m`;
  const value = units === "mi" ? meters / 1609.344 : meters / 1000;
  return `${new Intl.NumberFormat(language === "sv" ? "sv-SE" : "en", {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value)} ${units}`;
};

export function DirectionsDialog({
  open,
  route,
  routeName,
  units,
  language,
  onClose,
}: {
  open: boolean;
  route?: NormalizedRoute;
  routeName: string;
  units: DisplayUnits;
  language: Language;
  onClose: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(open, dialogRef, backdropRef, onClose);
  if (!open || !route) return null;

  return (
    <div
      ref={backdropRef}
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog directions-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="directions-title"
      >
        <header>
          <div>
            <span className="eyebrow">
              <Menu size={15} /> {routeName}
            </span>
            <h2 id="directions-title">{t(language, "viewDirections")}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t(language, "close")}>
            <X />
          </button>
        </header>
        {route.instructions.length ? (
          <ol className="directions-dialog-list">
            {route.instructions.map((instruction, index) => (
              <li key={`${instruction.text}-${index}`}>
                <span aria-hidden="true">{index + 1}</span>
                <div>
                  <strong>{instruction.text}</strong>
                  <small>{formatDistance(instruction.distanceMeters, units, language)}</small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p>{t(language, "unknown")}</p>
        )}
      </section>
    </div>
  );
}

import { DatabaseZap, ExternalLink, X } from "lucide-react";
import { APP_NAME } from "../../config/app";
import type { Preferences } from "../../services/storage";
import { t } from "../../i18n";

export function SettingsDialog({
  open,
  preferences,
  onChange,
  onClear,
  onClose,
}: {
  open: boolean;
  preferences: Preferences;
  onChange: (value: Preferences) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const language = preferences.language;
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header>
          <div>
            <span className="eyebrow">{APP_NAME}</span>
            <h2 id="settings-title">{t(language, "settings")}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t(language, "close")}>
            <X />
          </button>
        </header>
        <label>
          {t(language, "language")}
          <select
            value={preferences.language}
            onChange={(event) =>
              onChange({ ...preferences, language: event.target.value as Preferences["language"] })
            }
          >
            <option value="en">English</option>
            <option value="sv">Svenska</option>
          </select>
        </label>
        <label>
          {t(language, "units")}
          <select
            value={preferences.units}
            onChange={(event) =>
              onChange({ ...preferences, units: event.target.value as Preferences["units"] })
            }
          >
            <option value="km">{t(language, "kilometres")}</option>
            <option value="mi">{t(language, "miles")}</option>
          </select>
        </label>
        <label>
          {t(language, "theme")}
          <select
            value={preferences.theme}
            onChange={(event) =>
              onChange({ ...preferences, theme: event.target.value as Preferences["theme"] })
            }
          >
            <option value="system">{t(language, "system")}</option>
            <option value="light">{t(language, "light")}</option>
            <option value="dark">{t(language, "dark")}</option>
          </select>
        </label>
        <label>
          {t(language, "pace")}
          <input
            type="number"
            min="3"
            max="15"
            step="0.25"
            value={(preferences.paceSecondsPerKm / 60).toFixed(2)}
            onChange={(event) =>
              onChange({ ...preferences, paceSecondsPerKm: Number(event.target.value) * 60 })
            }
          />
        </label>
        <div className="about-block">
          <h3>{t(language, "about")}</h3>
          <p>{t(language, "attributionCopy")}</p>
          <p>{t(language, "legal")}</p>
          <p className="privacy-note">{t(language, "localPrivacy")}</p>
          <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
            OpenFreeMap <ExternalLink size={14} />
          </a>
        </div>
        <button className="danger-button" onClick={onClear}>
          <DatabaseZap size={18} />
          {t(language, "clearData")}
        </button>
      </section>
    </div>
  );
}

import { Copy, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { Language } from "../../config/app";
import { t } from "../../i18n";

export function ShareDialog({
  open,
  language,
  onShare,
  onClose,
}: {
  open: boolean;
  language: Language;
  onShare: (precise: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [precise, setPrecise] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  return (
    <div className="dialog-backdrop">
      <section
        className="dialog share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
      >
        <header>
          <div>
            <span className="eyebrow">
              <ShieldCheck size={15} /> Privacy first
            </span>
            <h2 id="share-title">{t(language, "share")}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t(language, "close")}>
            <X />
          </button>
        </header>
        <h3>{t(language, "privacyShare")}</h3>
        <p>{t(language, "privacyDetail")}</p>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={precise}
            onChange={(event) => setPrecise(event.target.checked)}
          />
          <span className="switch" />
          <span>
            <strong>{t(language, "preciseStart")}</strong>
            <small>{t(language, "preciseWarning")}</small>
          </span>
        </label>
        <button
          className="primary-button"
          onClick={async () => {
            await onShare(precise);
            setCopied(true);
          }}
        >
          <Copy size={18} />
          {copied ? t(language, "linkCopied") : t(language, "copyLink")}
        </button>
      </section>
    </div>
  );
}

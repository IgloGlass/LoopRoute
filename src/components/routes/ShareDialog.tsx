import { Copy, ShieldCheck, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Language } from "../../config/app";
import { useDialogFocus } from "../../hooks/useDialogFocus";
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
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [precise, setPrecise] = useState(false);
  const [copied, setCopied] = useState(false);
  useDialogFocus(open, dialogRef, backdropRef, onClose);
  if (!open) return null;
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
        className="dialog share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
      >
        <header>
          <div>
            <span className="eyebrow">
              <ShieldCheck size={15} /> {t(language, "privacyFirst")}
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

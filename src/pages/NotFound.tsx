import { Link } from "react-router-dom";
import { ScanIcon } from "../components/Icons";
import { useI18n } from "../lib/i18n";

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
      <p className="glyph text-5xl text-gold">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-wide">{t("notfound.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {t("notfound.body")}
      </p>
      <div className="mt-5 flex gap-2">
        <Link to="/" className="btn btn-gold">
          <ScanIcon className="h-4 w-4" /> {t("notfound.scanner")}
        </Link>
        <Link to="/manual" className="btn btn-ghost">
          {t("notfound.manual")}
        </Link>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import { Logo } from "./Header";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-20 border-t border-line/70 bg-surface/30">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            {t("footer.about", { solaris: "Solaris-3" })}
          </p>
          <p className="mt-4 text-xs text-muted/80">{t("footer.disclaimer")}</p>
        </div>
        <div>
          <p className="label">{t("footer.tools")}</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <Link className="transition hover:text-gold" to="/">
                {t("footer.scanner")}
              </Link>
            </li>
            <li>
              <Link className="transition hover:text-gold" to="/manual">
                {t("footer.manual")}
              </Link>
            </li>
            <li>
              <Link className="transition hover:text-gold" to="/alphabet">
                {t("footer.alphabet")}
              </Link>
            </li>
            <li>
              <Link className="transition hover:text-gold" to="/variants">
                {t("footer.variants")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="label">{t("footer.searches")}</p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
            <li>Wuthering Waves Translator</li>
            <li>WuWa OCR</li>
            <li>Solaris-3 Alphabet Decoder</li>
            <li>WuWa Font Scanner</li>
          </ul>
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />
            {t("footer.client")}
          </p>
        </div>
      </div>

      <div className="border-t border-line/60 px-4 py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-muted md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display text-[0.66rem] uppercase tracking-[0.2em] text-gold">
              {t("footer.creditsTitle")}
            </p>
            <p className="mt-1">
              {t("footer.creditsLine", { author: "Luis (@k4wai1)" })}{" "}
              {t("footer.licenseLine", { license: "MIT" })}
            </p>
            <a
              className="mt-1 inline-block text-gold transition hover:underline"
              href="https://github.com/k4wai1"
              target="_blank"
              rel="noreferrer"
            >
              {t("footer.author")}
            </a>
            <span className="mx-2 text-line-strong">·</span>
            <a
              className="inline-block text-gold transition hover:underline"
              href="https://github.com/k4wai1/wuwa-translator-ocr"
              target="_blank"
              rel="noreferrer"
            >
              {t("footer.repo")}
            </a>
          </div>
          <div className="md:max-w-md md:text-right">
            <p className="font-display text-[0.66rem] uppercase tracking-[0.2em] text-muted/70">
              {t("footer.builtWith")}
            </p>
            <p className="mt-1 leading-relaxed">{t("footer.tech")}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-line/60 px-4 py-4 text-center font-display text-[0.62rem] tracking-[0.24em] text-muted/70">
        {t("footer.archive", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { PageMeta } from "../components/PageMeta";
import { AlertIcon, CloseIcon, LayersIcon, ScanIcon } from "../components/Icons";
import { VARIANT_IMAGES } from "../lib/examples";
import { useI18n } from "../lib/i18n";

export function Variants() {
  const { t } = useI18n();
  const [active, setActive] = useState<number | null>(null);

  return (
    <>
      <PageMeta
        title={t("variants.metaTitle")}
        description={t("variants.metaDesc")}
        path="/variants"
      />
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="max-w-3xl">
          <span className="chip border-cyan/40 text-cyan">
            <LayersIcon className="h-3 w-3" /> {t("variants.badge")}
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {t("variants.titleA")} <span className="text-gold">{t("variants.titleB")}</span> {t("variants.titleC")}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
            {t("variants.body")}
          </p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-gold/40 bg-gold/10 p-4">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div className="text-xs leading-relaxed text-muted">
            <p className="font-display text-sm font-semibold text-gold">{t("variants.warnTitle")}</p>
            <p className="mt-1">
              {t("variants.warnBody")}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {VARIANT_IMAGES.map((img, i) => (
            <button
              key={img.titleKey}
              type="button"
              onClick={() => setActive(i)}
              className="group overflow-hidden rounded-lg border border-line bg-surface/40 text-left transition hover:border-cyan/50"
            >
              <span className="block aspect-[16/10] overflow-hidden bg-black/30">
                <img
                  src={img.src}
                  alt={t(img.titleKey)}
                  loading="lazy"
                  className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100"
                />
              </span>
              <span className="block p-4">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-semibold text-ink">{t(img.titleKey)}</span>
                  <span className="chip !text-[0.55rem]">{t("variants.notSupported")}</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">{t(img.noteKey)}</span>
              </span>
            </button>
          ))}
        </div>

        <section className="panel mt-10 grid gap-5 p-5 md:grid-cols-[1.3fr_1fr] md:items-center">
          <div>
            <p className="label text-gold">{t("variants.supportedLabel")}</p>
            <h2 className="mt-1 font-display text-xl font-bold">
              {t("variants.supportedTitle")}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {t("variants.supportedBody")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/alphabet" className="btn btn-gold !py-2">
                {t("variants.ctaAlphabet")}
              </Link>
              <Link to="/" className="btn btn-ghost !py-2">
                <ScanIcon className="h-4 w-4" /> {t("variants.ctaScan")}
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-bg/50 p-4">
            <p className="glyph text-2xl leading-relaxed text-gold">SOLARIS 3</p>
            <p className="mt-2 border-t border-line/60 pt-2 font-display text-[0.62rem] tracking-[0.28em] text-muted">
              SOLARIS 3 · SUPPORTED SCRIPT
            </p>
            <p className="mt-3 text-[0.68rem] leading-relaxed text-muted">
              {t("variants.cardNote")}
            </p>
          </div>
        </section>
      </div>

      {active !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setActive(null)}
        >
          <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg border border-line bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <p className="font-display text-sm font-semibold">{t(VARIANT_IMAGES[active].titleKey)}</p>
                <p className="text-[0.68rem] text-muted">{t(VARIANT_IMAGES[active].noteKey)}</p>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="grid h-8 w-8 place-items-center rounded border border-line text-muted hover:text-ink"
                aria-label={t("common.close")}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[76vh] overflow-auto bg-black/40">
              <img
                src={VARIANT_IMAGES[active].src}
                alt={t(VARIANT_IMAGES[active].titleKey)}
                className="mx-auto max-h-[76vh] w-auto max-w-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { PageMeta } from "../components/PageMeta";
import { AlertIcon, CloseIcon, LayersIcon, ScanIcon } from "../components/Icons";
import { VARIANT_IMAGES } from "../lib/examples";

export function Variants() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <>
      <PageMeta
        title="Otras variantes del lore — WuWa Translator OCR"
        description="Lahairoi, Raguna y otras caligrafías regionales de Wuthering Waves. Se muestran como referencia del lore, pero no forman parte del alfabeto Solaris-3 soportado por el OCR."
        path="/variants"
      />
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="max-w-3xl">
          <span className="chip border-cyan/40 text-cyan">
            <LayersIcon className="h-3 w-3" /> Archivo del lore
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Otras variantes del <span className="text-gold">lore</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
            Wuthering Waves incluye otros sistemas de escritura cursivos usados en distintas
            regiones. Esta página los muestra únicamente como referencia cultural: el detector y el
            traductor de este proyecto están entrenados <strong className="text-ink">solo</strong>{" "}
            con el alfabeto Solaris-3 estándar.
          </p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-gold/40 bg-gold/10 p-4">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div className="text-xs leading-relaxed text-muted">
            <p className="font-display text-sm font-semibold text-gold">No soportadas por el OCR</p>
            <p className="mt-1">
              Las muestras de <strong className="text-ink">Lahairoi</strong>,{" "}
              <strong className="text-ink">Raguna</strong> y la versión beta no se usaron para
              generar el dataset ni para validar el modelo. Mezclarlas contaminaría el entrenamiento:
              sus trazos cursivos y ligaduras no corresponden a los glifos discretos de Solaris-3.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {VARIANT_IMAGES.map((img, i) => (
            <button
              key={img.title}
              type="button"
              onClick={() => setActive(i)}
              className="group overflow-hidden rounded-lg border border-line bg-surface/40 text-left transition hover:border-cyan/50"
            >
              <span className="block aspect-[16/10] overflow-hidden bg-black/30">
                <img
                  src={img.src}
                  alt={img.title}
                  loading="lazy"
                  className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100"
                />
              </span>
              <span className="block p-4">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-semibold text-ink">{img.title}</span>
                  <span className="chip !text-[0.55rem]">No soportada</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">{img.note}</span>
              </span>
            </button>
          ))}
        </div>

        <section className="panel mt-10 grid gap-5 p-5 md:grid-cols-[1.3fr_1fr] md:items-center">
          <div>
            <p className="label text-gold">¿Qué sí está soportado?</p>
            <h2 className="mt-1 font-display text-xl font-bold">
              El alfabeto Solaris-3 estándar de 45 glifos
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Si tu captura usa los glifos discretos de los carteles y menús del juego, el escáner
              debería funcionar. Revisa la tabla completa para comparar cada símbolo antes de
              escanear.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/alphabet" className="btn btn-gold !py-2">
                Ver los 45 glifos
              </Link>
              <Link to="/" className="btn btn-ghost !py-2">
                <ScanIcon className="h-4 w-4" /> Ir al escáner
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-bg/50 p-4">
            <p className="glyph text-2xl leading-relaxed text-gold">SOLARIS 3</p>
            <p className="mt-2 border-t border-line/60 pt-2 font-display text-[0.62rem] tracking-[0.28em] text-muted">
              SOLARIS 3 · SUPPORTED SCRIPT
            </p>
            <p className="mt-3 text-[0.68rem] leading-relaxed text-muted">
              Unicase, sustitución latina, corchetes en lugar de llaves y punto fusionado con la A.
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
                <p className="font-display text-sm font-semibold">{VARIANT_IMAGES[active].title}</p>
                <p className="text-[0.68rem] text-muted">{VARIANT_IMAGES[active].note}</p>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="grid h-8 w-8 place-items-center rounded border border-line text-muted hover:text-ink"
                aria-label="Cerrar"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[76vh] overflow-auto bg-black/40">
              <img
                src={VARIANT_IMAGES[active].src}
                alt={VARIANT_IMAGES[active].title}
                className="mx-auto max-h-[76vh] w-auto max-w-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

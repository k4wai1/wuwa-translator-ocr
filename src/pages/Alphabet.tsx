import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageMeta } from "../components/PageMeta";
import { AlphabetIcon, CheckIcon, CopyIcon, KeyboardIcon } from "../components/Icons";
import { CLASSES, GLYPH_LABELS, filterRenderable } from "../lib/classes";

const LETTERS = CLASSES.slice(0, 26);
const DIGITS = CLASSES.slice(26, 36);
const PUNCT = CLASSES.slice(36);

export function Alphabet() {
  const [converter, setConverter] = useState("SOLARIS 3");
  const [copied, setCopied] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return CLASSES;
    const q = query.trim().toUpperCase();
    return CLASSES.filter((c) => c === q || (GLYPH_LABELS[c] || "").toLowerCase().includes(q.toLowerCase()));
  }, [query]);

  const copy = async (ch: string) => {
    try {
      await navigator.clipboard.writeText(ch);
      setCopied(ch);
      window.setTimeout(() => setCopied(""), 1200);
    } catch {
      /* noop */
    }
  };

  return (
    <>
      <PageMeta
        title="Alfabeto Solaris-3 completo — WuWa Font Scanner"
        description="Tabla completa de los 45 glifos del alfabeto Solaris-3 de Wuthering Waves: letras A-Z, números 0-9 y signos. Incluye conversor en vivo y notas sobre el punto y los corchetes."
        path="/alphabet"
      />
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <span className="chip border-gold/40 text-gold">
              <AlphabetIcon className="h-3 w-3" /> Referencia oficial
            </span>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Alfabeto <span className="text-gold">Solaris-3</span> completo
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              45 glifos únicos: 26 letras, 10 números y 9 signos de puntuación. Las minúsculas
              comparten el mismo dibujo que las mayúsculas, así que no se entrenan como clases
              separadas.
            </p>
          </div>

          <div className="panel p-4">
            <label className="label" htmlFor="converter">
              Conversor en vivo
            </label>
            <input
              id="converter"
              value={converter}
              onChange={(e) => setConverter(filterRenderable(e.target.value).slice(0, 120))}
              className="input mt-2 font-body text-sm"
              placeholder="Escribe en inglés…"
              maxLength={120}
            />
            <div className="mt-3 min-h-[86px] rounded-lg border border-line bg-bg/60 p-3">
              <p className="glyph break-words text-2xl leading-relaxed text-gold">
                {converter || "SOLARIS-3"}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-between text-[0.62rem] text-muted">
              <span>{converter.length} caracteres</span>
              <Link to="/manual" className="text-gold hover:underline">
                Abrir editor completo →
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-muted">
            <span className="chip">A / . fusionados</span>
            <span className="chip">Sin llaves</span>
            <span className="chip">Corchetes [ ]</span>
            <span className="chip">Minúsculas = mayúsculas</span>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar glifo…"
            className="input max-w-[220px] !py-1.5 text-xs"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted">No hay glifos que coincidan con «{query}».</p>
        ) : (
          <>
            <Section title="Letras" count={26} note="A – Z. El glifo se muestra tal como lo dibuja la fuente; la letra latina equivalente aparece debajo.">
              <Grid chars={LETTERS} onCopy={copy} copied={copied} />
            </Section>
            <Section title="Números" count={10} note="0 – 9. Tienen un estilo caligráfico propio, distinto de las letras.">
              <Grid chars={DIGITS} onCopy={copy} copied={copied} />
            </Section>
            <Section
              title="Signos de puntuación"
              count={9}
              note="Paréntesis, coma, guion, barra, dos puntos, punto y coma y corchetes. La fuente no incluye llaves { }."
            >
              <Grid chars={PUNCT} onCopy={copy} copied={copied} />
            </Section>
          </>
        )}

        <section className="panel mt-10 p-5">
          <h2 className="font-display text-lg font-bold tracking-wide">Notas técnicas del glifo</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Note title="A y punto son el mismo glifo">
              La fuente dibuja <span className="glyph text-gold">A</span>,{" "}
              <span className="glyph text-gold">a</span> y <span className="glyph text-gold">.</span>{" "}
              con el mismo contorno. El detector usa una sola clase; el post-procesado decide si es
              punto cuando aparece aislado al final de una palabra o línea.
            </Note>
            <Note title="Corchetes, no llaves">
              Los símbolos disponibles después de la Z son{" "}
              <span className="glyph text-gold">[</span> y{" "}
              <span className="glyph text-gold">]</span>. Las llaves no forman parte del repertorio
              del archivo <code className="text-ink">Solaris-3 Script.ttf</code>.
            </Note>
            <Note title="Unicase">
              El alfabeto es <em>unicase</em>: no distingue mayúsculas de minúsculas. Por eso el OCR
              devuelve la transcripción en mayúsculas y solo se entrenan 26 clases de letras.
            </Note>
          </div>
        </section>

        <section className="panel mt-5 overflow-hidden">
          <div className="grid gap-5 p-5 md:grid-cols-[1fr_1.3fr] md:items-center">
            <div>
              <p className="label text-gold">Poster de referencia</p>
              <h2 className="mt-1 font-display text-xl font-bold">La tabla que inició todo</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Referencia visual del alfabeto con las equivalencias latinas. Úsala junto al teclado
                visual del traductor manual para verificar glifos difíciles o ambiguos.
              </p>
              <div className="mt-3 flex gap-2">
                <Link to="/manual" className="btn btn-gold !py-2">
                  <KeyboardIcon className="h-4 w-4" /> Traducir a mano
                </Link>
                <Link to="/" className="btn btn-ghost !py-2">
                  Escanear captura
                </Link>
              </div>
            </div>
            <a
              href={`${import.meta.env.BASE_URL}examples/alphabet-poster.jpg`}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border border-line bg-black/30"
            >
              <img
                src={`${import.meta.env.BASE_URL}examples/alphabet-poster.jpg`}
                alt="Poster del alfabeto Solaris-3 con equivalencias latinas"
                className="h-auto w-full"
                loading="lazy"
              />
            </a>
          </div>
        </section>
      </div>
    </>
  );
}

function Section({
  title,
  count,
  note,
  children,
}: {
  title: string;
  count: number;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-9">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold tracking-wide">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{note}</p>
        </div>
        <span className="chip">{count} glifos</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Grid({ chars, onCopy, copied }: { chars: string[]; onCopy: (ch: string) => void; copied: string }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
      {chars.map((ch) => (
        <button
          key={ch}
          type="button"
          onClick={() => onCopy(ch)}
          title={`Copiar ${ch}`}
          className="group relative flex aspect-square flex-col items-center justify-center rounded-lg border border-line bg-surface/40 transition hover:border-gold/50 hover:bg-gold/10"
        >
          <span className="glyph text-3xl leading-none text-ink transition group-hover:text-gold">{ch}</span>
          <span className="mt-2 font-display text-[0.58rem] uppercase tracking-[0.18em] text-muted">
            {GLYPH_LABELS[ch] ? ch : ch === "A" ? "A / ." : ch}
          </span>
          {copied === ch && (
            <span className="absolute right-1 top-1 text-ok">
              <CheckIcon className="h-3 w-3" />
            </span>
          )}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gold py-0.5 text-center text-[0.5rem] font-semibold uppercase tracking-wider text-black group-hover:block">
            <CopyIcon className="mr-0.5 inline h-2.5 w-2.5" /> copiar
          </span>
        </button>
      ))}
    </div>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface/40 p-3">
      <h3 className="font-display text-sm font-semibold text-gold">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{children}</p>
    </div>
  );
}

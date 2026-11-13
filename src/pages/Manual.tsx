import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageMeta } from "../components/PageMeta";
import {
  AlphabetIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  KeyboardIcon,
  SparkIcon,
} from "../components/Icons";
import { CLASSES, filterRenderable, GLYPH_LABELS } from "../lib/classes";
import { EXAMPLE_IMAGES, LIVESTREAM_IMAGES } from "../lib/examples";
import { useTheme } from "../lib/theme";

const DEFAULT_TEXT = "WUTHERING WAVES\nSOLARIS-3 SCRIPT\nJINZHOU 12:45\n(A) [B] A, B; C";

export function Manual() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [filter, setFilter] = useState<"todas" | "captura" | "letrero" | "livestream" | "alfabeto">("todas");
  const editorRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  const normalize = (value: string) => filterRenderable(value.replace(/\r/g, ""));

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerText !== text) el.innerText = text;
  }, [text]);

  const append = (ch: string) => {
    setText((t) => (t + ch).slice(0, 4000));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* noop */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const downloadPng = async () => {
    if (!text.trim()) return;
    setDownloading(true);
    try {
      await document.fonts.load('64px "Solaris-3"');
      await document.fonts.ready;
      const width = 1600;
      const margin = 96;
      const fontSize = 58;
      const lineHeight = fontSize * 1.55;
      const maxWidth = width - margin * 2;
      const lines: string[] = [];
      const paragraphLines = text.split("\n");
      const measureCanvas = document.createElement("canvas");
      const mctx = measureCanvas.getContext("2d")!;
      mctx.font = `600 ${fontSize}px "Solaris-3", "Noto Sans", sans-serif`;
      for (const para of paragraphLines) {
        if (!para) {
          lines.push("");
          continue;
        }
        let current = "";
        for (const ch of para) {
          const next = current + ch;
          if (mctx.measureText(next).width > maxWidth && current) {
            lines.push(current);
            current = ch;
          } else {
            current = next;
          }
        }
        if (current) lines.push(current);
      }
      const height = Math.max(520, margin * 2 + lines.length * lineHeight + 120);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;

      if (theme === "dark") {
        const g = ctx.createLinearGradient(0, 0, width, height);
        g.addColorStop(0, "#0b0d12");
        g.addColorStop(1, "#11161f");
        ctx.fillStyle = g;
      } else {
        const g = ctx.createLinearGradient(0, 0, width, height);
        g.addColorStop(0, "#f4f3ef");
        g.addColorStop(1, "#e6e3d8");
        ctx.fillStyle = g;
      }
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = theme === "dark" ? "rgba(212,177,112,0.18)" : "rgba(168,132,63,0.22)";
      ctx.lineWidth = 1;
      for (let x = margin; x < width - margin; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, margin);
        ctx.lineTo(x, height - margin);
        ctx.stroke();
      }
      for (let y = margin; y < height - margin; y += 64) {
        ctx.beginPath();
        ctx.moveTo(margin, y);
        ctx.lineTo(width - margin, y);
        ctx.stroke();
      }

      ctx.strokeStyle = theme === "dark" ? "#d4b170" : "#a8843f";
      ctx.lineWidth = 2;
      ctx.strokeRect(margin / 2, margin / 2, width - margin, height - margin);
      ctx.fillStyle = theme === "dark" ? "#4deeea" : "#0e8f8a";
      ctx.font = '600 20px "Chakra Petch", sans-serif';
      ctx.fillText("SOLARIS-3 // TRANSCRIPT", margin, margin - 26);
      ctx.fillStyle = theme === "dark" ? "#8d93a3" : "#676c76";
      ctx.fillText(`WUWA TRANSLATOR OCR · ${new Date().toLocaleDateString()}`, margin + 300, margin - 26);

      ctx.fillStyle = theme === "dark" ? "#e7cd9a" : "#3a3020";
      ctx.font = `600 ${fontSize}px "Solaris-3", "Noto Sans", sans-serif`;
      lines.forEach((line, i) => {
        ctx.fillText(line, margin, margin + 40 + i * lineHeight);
      });

      ctx.fillStyle = theme === "dark" ? "#8d93a3" : "#676c76";
      ctx.font = '500 18px "Chakra Petch", sans-serif';
      ctx.fillText("WUWA · SOLARIS-3 ALPHABET DECODER", margin, height - margin / 2);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "solaris-3.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setDownloading(false);
    }
  };

  const filtered = useMemo(
    () => (filter === "todas" ? EXAMPLE_IMAGES : EXAMPLE_IMAGES.filter((e) => e.tag === filter)),
    [filter],
  );

  const active = lightbox !== null ? filtered[lightbox] : null;

  return (
    <>
      <PageMeta
        title="Traductor Manual Solaris-3 — WuWa Font Scanner"
        description="Escribe texto y conviértelo al alfabeto Solaris-3 de Wuthering Waves en tiempo real, o arma la traducción glifo a glifo con el teclado visual. Copia el texto o descarga un PNG."
        path="/manual"
      />
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip border-gold/40 text-gold">
              <KeyboardIcon className="h-3 w-3" /> Editor bidireccional
            </span>
            <span className="chip">45 glifos</span>
            <span className="chip">Descarga PNG</span>
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Traductor manual <span className="text-gold">Solaris-3</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
            Escribe en inglés y observa la versión en escritura Solaris-3 al instante. También puedes
            construir la traducción glifo a glifo con el teclado visual y descargar el resultado como
            imagen PNG para compartirlo.
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <section className="panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label">Editor sincronizado</p>
              <div className="flex gap-1.5">
                <button type="button" className="btn btn-ghost !px-2.5 !py-1.5" onClick={copy}>
                  {copied ? <CheckIcon className="h-3.5 w-3.5 text-ok" /> : <CopyIcon className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{copied ? "Copiado" : "Copiar"}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !px-2.5 !py-1.5"
                  onClick={downloadPng}
                  disabled={downloading || !text.trim()}
                >
                  {downloading ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-gold" />
                  ) : (
                    <DownloadIcon className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">PNG</span>
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label text-gold">Solaris-3 Script</span>
                <span className="text-[0.62rem] text-muted">{text.length} caracteres</span>
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                role="textbox"
                aria-multiline="true"
                aria-label="Texto renderizado en Solaris-3"
                onInput={() => {
                  const next = normalize(editorRef.current?.innerText ?? "");
                  if (next !== text) setText(next);
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = normalize(e.clipboardData.getData("text"));
                  document.execCommand("insertText", false, pasted);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).blur();
                  }
                }}
                className="glyph min-h-[150px] w-full whitespace-pre-wrap break-words rounded-lg border border-line bg-bg/60 p-4 text-[1.7rem] leading-[1.5] tracking-[0.06em] text-gold outline-none transition focus:border-gold/60 sm:text-[2rem]"
              />
              <p className="mt-1 text-[0.66rem] text-muted/80">
                Puedes escribir directamente aquí: el glifo se dibuja con la fuente oficial.
              </p>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label">Texto ASCII / Inglés</span>
                <span className="text-[0.62rem] text-muted">sincronizado</span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(normalize(e.target.value))}
                spellCheck={false}
                rows={5}
                placeholder="Escribe aquí para ver la traducción…"
                className="input resize-y font-body text-sm leading-relaxed"
                aria-label="Texto normal en inglés"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost !py-1.5" onClick={() => append(" ")}>
                  Espacio
                </button>
                <button type="button" className="btn btn-ghost !py-1.5" onClick={() => append(".")}>
                  Punto
                </button>
                <button type="button" className="btn btn-ghost !py-1.5" onClick={() => setText((t) => t.slice(0, -1))}>
                  Borrar
                </button>
                <button type="button" className="btn btn-ghost !py-1.5" onClick={() => setText("")}>
                  Limpiar
                </button>
                <Link to="/alphabet" className="btn btn-cyan !py-1.5">
                  <AlphabetIcon className="h-3.5 w-3.5" /> Ver tabla
                </Link>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-line bg-surface/40 p-3 text-[0.7rem] leading-relaxed text-muted">
              <p className="flex items-center gap-1.5 font-semibold text-ink">
                <SparkIcon className="h-3.5 w-3.5 text-gold" /> Nota de la fuente
              </p>
              <p className="mt-1">
                El glifo de <span className="text-gold">A</span> es idéntico al del punto{" "}
                <span className="text-gold">.</span>; por eso la detección los fusiona en una clase y
                usa contexto para distinguirlos. Los corchetes disponibles son{" "}
                <span className="text-gold">[ ]</span>: la fuente no incluye llaves.
              </p>
            </div>
          </section>

          <section className="panel p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="label text-gold">Teclado visual</p>
                <p className="mt-1 text-xs text-muted">Haz clic para añadir el glifo al texto.</p>
              </div>
              <span className="chip">{CLASSES.length} clases</span>
            </div>

            <div className="mt-4 grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-7 xl:grid-cols-8">
              {CLASSES.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => append(ch)}
                  title={GLYPH_LABELS[ch] ? `${ch} · ${GLYPH_LABELS[ch]}` : ch}
                  className="group flex aspect-square flex-col items-center justify-center rounded border border-line bg-surface/40 transition hover:border-gold/60 hover:bg-gold/10"
                >
                  <span className="glyph text-lg leading-none text-ink group-hover:text-gold sm:text-xl">
                    {ch}
                  </span>
                  <span className="mt-1 font-display text-[0.55rem] tracking-widest text-muted">
                    {ch === "A" ? "A / ." : ch}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-line bg-bg/40 p-3">
              <p className="text-[0.68rem] leading-relaxed text-muted">
                <span className="text-gold">Lectura inversa:</span> si el OCR falla con una letra
                difícil, compara el glifo de tu captura con esta cuadrícula y haz clic en el símbolo
                correspondiente para armar la traducción manualmente.
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {["(", ")", ",", "-", ".", "/", ":", ";", "[", "]"].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => append(ch)}
                  className="flex h-9 min-w-9 items-center justify-center rounded border border-line bg-surface/40 px-2 hover:border-cyan/60"
                  title={`Añadir ${ch}`}
                >
                  <span className="glyph text-base text-cyan">{ch}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-14" aria-labelledby="gallery-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label text-gold">Referencia visual</p>
              <h2 id="gallery-title" className="mt-1 font-display text-2xl font-bold tracking-wide">
                Galería de capturas
              </h2>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">
                Capturas reales del juego para comparar mientras traduces a mano. Los frames de
                livestream incluyen partículas y brillos: úsalos para practicar con el pre-procesado.
              </p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-md border border-line bg-surface/50 p-0.5">
              {(
                [
                  ["todas", "Todas"],
                  ["captura", "Capturas"],
                  ["letrero", "Letreros"],
                  ["livestream", "Livestream"],
                  ["alfabeto", "Alfabeto"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded px-2.5 py-1 font-display text-[0.62rem] uppercase tracking-wider transition ${
                    filter === id ? "bg-gold text-black" : "text-muted hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightbox(i)}
                className="group overflow-hidden rounded-lg border border-line bg-surface/40 text-left transition hover:border-gold/50"
              >
                <span className="block aspect-[4/3] overflow-hidden bg-black/30">
                  <img
                    src={img.src}
                    alt={img.title}
                    loading="lazy"
                    className="h-full w-full object-cover opacity-85 transition duration-300 group-hover:scale-[1.03] group-hover:opacity-100"
                  />
                </span>
                <span className="block p-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-display text-[0.7rem] font-semibold text-ink">
                      {img.title}
                    </span>
                    <span className="shrink-0 text-[0.55rem] uppercase tracking-widest text-gold">
                      {img.tag}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[0.62rem] leading-snug text-muted">
                    {img.note}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <p className="mt-4 text-[0.66rem] text-muted/80">
            {LIVESTREAM_IMAGES.length} frames de livestream disponibles como test set de estrés.
            Esta galería es solo de referencia: no se usa para entrenar el modelo.
          </p>
        </section>
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
          onClick={() => setLightbox(null)}
        >
          <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-lg border border-line bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <p className="font-display text-sm font-semibold">{active.title}</p>
                <p className="text-[0.68rem] text-muted">{active.note}</p>
              </div>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded border border-line text-muted hover:text-ink"
                aria-label="Cerrar"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[72vh] overflow-auto bg-black/40">
              <img src={active.src} alt={active.title} className="mx-auto max-h-[72vh] w-auto max-w-full" />
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
              <button
                type="button"
                className="btn btn-ghost !py-1.5"
                onClick={() => setLightbox((i) => (i === null ? i : (i - 1 + filtered.length) % filtered.length))}
              >
                Anterior
              </button>
              <span className="text-[0.66rem] text-muted">
                {(lightbox ?? 0) + 1} / {filtered.length}
              </span>
              <button
                type="button"
                className="btn btn-ghost !py-1.5"
                onClick={() => setLightbox((i) => (i === null ? i : (i + 1) % filtered.length))}
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

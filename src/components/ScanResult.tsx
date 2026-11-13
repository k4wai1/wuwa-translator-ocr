import { useMemo, useState } from "react";
import type { OcrResult } from "../lib/types";
import { CheckIcon, CopyIcon, DownloadIcon, EyeIcon } from "./Icons";

interface ScanResultProps {
  result: OcrResult;
  imageUrl: string;
  periodHeuristic: boolean;
  onPeriodHeuristic: (v: boolean) => void;
}

export function ScanResult({ result, imageUrl, periodHeuristic, onPeriodHeuristic }: ScanResultProps) {
  const [copied, setCopied] = useState(false);
  const [showBoxes, setShowBoxes] = useState(true);
  const [showLetters, setShowLetters] = useState(true);
  const [tab, setTab] = useState<"text" | "data">("text");

  const charCount = result.detections.length;
  const avgConf = useMemo(
    () =>
      result.detections.length
        ? result.detections.reduce((a, d) => a + d.confidence, 0) / result.detections.length
        : 0,
    [result],
  );

  const sorted = useMemo(
    () => [...result.detections].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0),
    [result],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = result.text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "solaris-3-transcripcion.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip border-ok/40 text-ok">
          <CheckIcon className="h-3 w-3" /> Escaneo completado
        </span>
        <span className="chip">{charCount} glifos</span>
        <span className="chip">{result.lines.length} líneas</span>
        <span className="chip">conf. media {(avgConf * 100).toFixed(0)}%</span>
        <span className="chip">{Math.round(result.tookMs)} ms</span>
      </div>

      {charCount === 0 && (
        <div className="rounded-lg border border-gold/40 bg-gold/10 p-4 text-sm text-ink">
          No se detectó ningún glifo. Prueba a recortar más cerca del texto, subir el contraste con
          <strong> Auto-mejorar</strong> o bajar el umbral de confianza.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label">Lectura sobre la imagen</p>
            <div className="flex items-center gap-3 text-[0.68rem] text-muted">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showBoxes}
                  onChange={(e) => setShowBoxes(e.target.checked)}
                  className="accent-gold"
                />
                Cajas
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showLetters}
                  onChange={(e) => setShowLetters(e.target.checked)}
                  className="accent-gold"
                />
                Letras
              </label>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border border-line bg-black/40">
            <img src={imageUrl} alt="Texto Solaris-3 detectado" className="block h-auto w-full" />
            <svg
              viewBox={`0 0 ${result.width} ${result.height}`}
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {sorted.map((d, i) => {
                const h = d.y1 - d.y0;
                const isPunct = d.cls >= 36;
                const color = isPunct ? "#4deeea" : "#d4b170";
                const label = d.letter;
                const labelSize = Math.max(8, Math.min(h * 0.95, result.width * 0.028));
                const above = d.y0 - labelSize * 0.22;
                return (
                  <g key={i}>
                    {showBoxes && (
                      <rect
                        x={d.x0}
                        y={d.y0}
                        width={Math.max(1, d.x1 - d.x0)}
                        height={Math.max(1, d.y1 - d.y0)}
                        fill="none"
                        stroke={color}
                        strokeWidth={Math.max(0.8, result.width * 0.0012)}
                        opacity={0.55 + d.confidence * 0.45}
                      />
                    )}
                    {showLetters && (
                      <text
                        x={d.x0 + (d.x1 - d.x0) / 2}
                        y={above}
                        textAnchor="middle"
                        fontSize={labelSize}
                        fontFamily="'Chakra Petch', sans-serif"
                        fontWeight={700}
                        fill={color}
                        stroke="#07080c"
                        strokeWidth={labelSize * 0.18}
                        paintOrder="stroke"
                        opacity={0.95}
                      >
                        {label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="text-[0.68rem] text-muted/80">
            Las letras sobre las cajas son la traducción directa del glifo. Las cajas cian son
            puntuación.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-md border border-line bg-surface/50 p-0.5">
              <button
                type="button"
                onClick={() => setTab("text")}
                className={`rounded px-3 py-1 font-display text-[0.66rem] uppercase tracking-wider transition ${
                  tab === "text" ? "bg-gold text-black" : "text-muted hover:text-ink"
                }`}
              >
                Transcripción
              </button>
              <button
                type="button"
                onClick={() => setTab("data")}
                className={`rounded px-3 py-1 font-display text-[0.66rem] uppercase tracking-wider transition ${
                  tab === "data" ? "bg-gold text-black" : "text-muted hover:text-ink"
                }`}
              >
                Datos
              </button>
            </div>
            <div className="flex gap-1.5">
              <button type="button" className="btn btn-ghost !px-2.5 !py-1.5" onClick={copy} title="Copiar texto">
                {copied ? <CheckIcon className="h-3.5 w-3.5 text-ok" /> : <CopyIcon className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{copied ? "Copiado" : "Copiar"}</span>
              </button>
              <button type="button" className="btn btn-ghost !px-2.5 !py-1.5" onClick={download} title="Descargar .txt">
                <DownloadIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">.txt</span>
              </button>
            </div>
          </div>

          {tab === "text" ? (
            <>
              <div className="min-h-[180px] rounded-lg border border-line bg-bg/50 p-4">
                <pre className="m-0 max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-body text-[0.95rem] leading-relaxed text-ink">
                  {result.text || "—"}
                </pre>
              </div>
              <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface/40 px-3 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-ink">Heurística A / punto</p>
                  <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted">
                    La fuente dibuja <span className="glyph text-gold">A</span> y{" "}
                    <span className="glyph text-gold">.</span> iguales. Si está activo, una «A»
                    aislada al final de una palabra se interpreta como punto.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={periodHeuristic}
                  onClick={() => onPeriodHeuristic(!periodHeuristic)}
                  className={`relative mt-1 h-5 w-9 shrink-0 rounded-full border transition ${
                    periodHeuristic ? "border-gold/60 bg-gold/30" : "border-line bg-surface-2"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
                      periodHeuristic ? "left-[18px] bg-gold" : "left-0.5 bg-muted"
                    }`}
                  />
                </button>
              </div>
              <div className="space-y-1.5">
                {result.lines.map((line, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded border border-line/60 bg-surface/30 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-display text-[0.62rem] tracking-widest text-muted">
                      L{i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-body text-ink">{line.text}</span>
                    <span className="shrink-0 text-[0.65rem] text-muted">
                      {line.detections.length} glifos
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="max-h-[520px] overflow-auto rounded-lg border border-line bg-bg/50">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-surface-2 text-muted">
                  <tr className="font-display text-[0.6rem] uppercase tracking-widest">
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Glifo</th>
                    <th className="px-2 py-2">Clase</th>
                    <th className="px-2 py-2">Conf.</th>
                    <th className="px-2 py-2">x, y</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, 500).map((d, i) => (
                    <tr key={i} className="border-t border-line/50">
                      <td className="px-2 py-1 text-muted">{i + 1}</td>
                      <td className="px-2 py-1">
                        <span className="glyph text-base text-gold">{d.letter}</span>
                      </td>
                      <td className="px-2 py-1 text-muted">{d.cls}</td>
                      <td className="px-2 py-1 tabular-nums text-ink">{(d.confidence * 100).toFixed(1)}%</td>
                      <td className="px-2 py-1 tabular-nums text-muted">
                        {Math.round(d.x0)}, {Math.round(d.y0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="flex items-center gap-1.5 border-t border-line/50 px-2 py-2 text-[0.65rem] text-muted">
                <EyeIcon className="h-3 w-3" /> Clase 0 = A/punto · 26–35 = dígitos · 36–44 = signos
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

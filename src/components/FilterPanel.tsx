import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeCanvas, autoEnhance, type FilterMode, type FilterOptions } from "../lib/preprocess";
import { ResetIcon, SparkIcon } from "./Icons";

const MODES: { id: FilterMode; label: string; hint: string }[] = [
  { id: "original", label: "Color", hint: "Imagen original con ajustes de brillo y contraste." },
  { id: "grayscale", label: "Gris + CLAHE", hint: "Ecualización adaptativa para texto del mismo tono." },
  { id: "threshold", label: "Umbral", hint: "Binariza el texto rescatando bajo contraste." },
  { id: "edges", label: "Bordes", hint: "Sobel para inscripciones grabadas en piedra." },
];

interface FilterPanelProps {
  source: HTMLCanvasElement;
  processed: HTMLCanvasElement;
  value: FilterOptions;
  onChange: (next: FilterOptions) => void;
}

export function FilterPanel({ source, processed, value, onChange }: FilterPanelProps) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const histRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<"after" | "before">("after");
  const stats = useMemo(() => analyzeCanvas(source), [source]);

  useEffect(() => {
    const canvas = view === "after" ? processed : source;
    const target = previewRef.current;
    if (!target) return;
    const maxW = 900;
    const maxH = 360;
    const scale = Math.min(1, maxW / canvas.width, maxH / canvas.height);
    target.width = Math.max(1, Math.round(canvas.width * scale));
    target.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = target.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(canvas, 0, 0, target.width, target.height);
  }, [processed, source, view]);

  useEffect(() => {
    const canvas = histRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const src = source.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, source.width, source.height);
    const hist = new Uint32Array(256);
    for (let i = 0; i < src.data.length; i += 4) {
      hist[Math.round(0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2])]++;
    }
    const max = Math.max(...hist);
    ctx.fillStyle = "rgba(212,177,112,0.55)";
    const bw = w / 256;
    for (let i = 0; i < 256; i++) {
      const bh = (hist[i] / max) * (h - 4);
      ctx.fillRect(i * bw, h - bh, Math.max(1, bw), bh);
    }
    ctx.strokeStyle = "rgba(77,238,234,0.8)";
    ctx.lineWidth = 1;
    for (const v of [stats.p5, stats.p95]) {
      ctx.beginPath();
      ctx.moveTo((v / 255) * w, 0);
      ctx.lineTo((v / 255) * w, h);
      ctx.stroke();
    }
  }, [source, stats]);

  const set = <K extends keyof FilterOptions>(key: K, v: FilterOptions[K]) =>
    onChange({ ...value, [key]: v });

  const applyAuto = () => onChange({ ...autoEnhance(source), thresholdBlock: value.thresholdBlock });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="label">Pre-procesador adaptativo</p>
          <p className="mt-1 text-xs text-muted">
            Rescata texto del mismo color que el fondo antes de pasarlo al modelo.
          </p>
        </div>
        <button type="button" className="btn btn-cyan" onClick={applyAuto}>
          <SparkIcon className="h-4 w-4" />
          Auto-mejorar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => set("mode", m.id)}
            className={`rounded-md border px-2 py-2 text-center font-display text-[0.66rem] font-semibold uppercase tracking-[0.12em] transition ${
              value.mode === m.id
                ? "border-gold/70 bg-gold/15 text-gold"
                : "border-line bg-surface/40 text-muted hover:border-line-strong hover:text-ink"
            }`}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-lg border border-line bg-black/40">
        <div className="absolute top-2 left-2 z-10 flex gap-1 rounded-md border border-line/70 bg-bg/80 p-0.5 backdrop-blur">
          {(["after", "before"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded px-2 py-1 font-display text-[0.6rem] uppercase tracking-widest transition ${
                view === v ? "bg-gold text-black" : "text-muted hover:text-ink"
              }`}
            >
              {v === "after" ? "Procesado" : "Original"}
            </button>
          ))}
        </div>
        <canvas ref={previewRef} className="mx-auto block max-h-[360px] w-auto max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
        <div className="space-y-3">
          <Slider label="Brillo" value={value.brightness} min={-100} max={100} onChange={(v) => set("brightness", v)} />
          <Slider label="Contraste" value={value.contrast} min={-100} max={100} onChange={(v) => set("contrast", v)} />
          {value.mode === "threshold" && (
            <>
              <Slider
                label="Bloque umbral"
                value={value.thresholdBlock}
                min={9}
                max={61}
                step={2}
                onChange={(v) => set("thresholdBlock", v % 2 === 0 ? v + 1 : v)}
              />
              <Slider label="Constante C" value={value.thresholdC} min={-10} max={20} onChange={(v) => set("thresholdC", v)} />
            </>
          )}
          {value.clahe && (
            <Slider
              label="Fuerza CLAHE"
              value={value.claheClip}
              min={1}
              max={6}
              step={0.1}
              decimals={1}
              onChange={(v) => set("claheClip", v)}
            />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border border-line bg-surface/40 px-3 py-2">
            <span className="text-xs text-muted">CLAHE</span>
            <Toggle checked={value.clahe} onChange={(v) => set("clahe", v)} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-line bg-surface/40 px-3 py-2">
            <span className="text-xs text-muted">Invertir</span>
            <Toggle checked={value.invert} onChange={(v) => set("invert", v)} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-line bg-surface/40 px-3 py-2">
            <span className="text-xs text-muted">Enfocar</span>
            <Toggle checked={value.sharpen} onChange={(v) => set("sharpen", v)} />
          </div>
          <button
            type="button"
            className="btn btn-ghost w-full !py-1.5"
            onClick={() =>
              onChange({
                ...value,
                brightness: 0,
                contrast: 0,
                clahe: false,
                invert: false,
                sharpen: false,
              })
            }
          >
            <ResetIcon className="h-3.5 w-3.5" />
            Restablecer
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="label">Histograma de luminancia</p>
          <div className="flex gap-2 font-display text-[0.6rem] uppercase tracking-wider text-muted">
            <span>μ {stats.mean.toFixed(0)}</span>
            <span>σ {stats.std.toFixed(0)}</span>
            <span className={stats.dynamicRange < 60 ? "text-danger" : "text-ok"}>
              rango {stats.dynamicRange}
            </span>
          </div>
        </div>
        <canvas ref={histRef} width={420} height={54} className="mt-2 h-[54px] w-full" />
        {stats.dynamicRange < 60 && (
          <p className="mt-1 text-[0.68rem] leading-relaxed text-gold/90">
            Contraste muy bajo detectado. Prueba <strong>Umbral</strong> o pulsa Auto-mejorar.
          </p>
        )}
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  decimals = 0,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-display text-[0.7rem] tabular-nums text-ink">
          {value.toFixed(decimals)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-gold"
      />
    </label>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full border transition ${
        checked ? "border-gold/60 bg-gold/30" : "border-line bg-surface-2"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
          checked ? "left-[18px] bg-gold" : "left-0.5 bg-muted"
        }`}
      />
    </button>
  );
}

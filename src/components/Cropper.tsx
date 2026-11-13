import { useCallback, useEffect, useRef, useState } from "react";
import type { CropRect } from "../lib/types";

type Handle = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface DragState {
  mode: Handle;
  startX: number;
  startY: number;
  rect: CropRect;
  width: number;
  height: number;
}

const MIN = 0.04;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface CropperProps {
  src: string;
  crop: CropRect;
  onChange: (crop: CropRect) => void;
  naturalWidth: number;
  naturalHeight: number;
  onReset?: () => void;
}

export function Cropper({ src, crop, onChange, naturalWidth, naturalHeight, onReset }: CropperProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const start = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const mode = (target.dataset.handle || (target.dataset.crop ? "move" : null)) as Handle | null;
      if (!mode) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      e.preventDefault();
      e.stopPropagation();
      wrap.setPointerCapture(e.pointerId);
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        rect: crop,
        width: wrap.clientWidth,
        height: wrap.clientHeight,
      };
      setDragging(true);
    },
    [crop],
  );

  const move = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();
      const dx = (e.clientX - drag.startX) / Math.max(1, drag.width);
      const dy = (e.clientY - drag.startY) / Math.max(1, drag.height);
      const r = drag.rect;
      let { x, y, w, h } = r;

      switch (drag.mode) {
        case "move":
          x = clamp(r.x + dx, 0, 1 - r.w);
          y = clamp(r.y + dy, 0, 1 - r.h);
          break;
        case "nw":
          x = clamp(r.x + dx, 0, r.x + r.w - MIN);
          y = clamp(r.y + dy, 0, r.y + r.h - MIN);
          w = r.w + (r.x - x);
          h = r.h + (r.y - y);
          break;
        case "n":
          y = clamp(r.y + dy, 0, r.y + r.h - MIN);
          h = r.h + (r.y - y);
          break;
        case "ne":
          y = clamp(r.y + dy, 0, r.y + r.h - MIN);
          h = r.h + (r.y - y);
          w = clamp(r.w + dx, MIN, 1 - r.x);
          break;
        case "e":
          w = clamp(r.w + dx, MIN, 1 - r.x);
          break;
        case "se":
          w = clamp(r.w + dx, MIN, 1 - r.x);
          h = clamp(r.h + dy, MIN, 1 - r.y);
          break;
        case "s":
          h = clamp(r.h + dy, MIN, 1 - r.y);
          break;
        case "sw":
          x = clamp(r.x + dx, 0, r.x + r.w - MIN);
          w = r.w + (r.x - x);
          h = clamp(r.h + dy, MIN, 1 - r.y);
          break;
        case "w":
          x = clamp(r.x + dx, 0, r.x + r.w - MIN);
          w = r.w + (r.x - x);
          break;
      }
      onChange({ x, y, w, h });
    },
    [onChange],
  );

  const end = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    try {
      wrapRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (e.target.closest("input, textarea, [contenteditable]")) return;
      const step = e.shiftKey ? 0.04 : 0.01;
      let next: CropRect | null = null;
      if (e.key === "ArrowLeft") next = { ...crop, x: clamp(crop.x - step, 0, 1 - crop.w) };
      if (e.key === "ArrowRight") next = { ...crop, x: clamp(crop.x + step, 0, 1 - crop.w) };
      if (e.key === "ArrowUp") next = { ...crop, y: clamp(crop.y - step, 0, 1 - crop.h) };
      if (e.key === "ArrowDown") next = { ...crop, y: clamp(crop.y + step, 0, 1 - crop.h) };
      if (next) {
        e.preventDefault();
        onChange(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [crop, onChange]);

  const pxW = Math.round(crop.w * naturalWidth);
  const pxH = Math.round(crop.h * naturalHeight);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          Recorte: <span className="text-ink">{pxW}</span> × <span className="text-ink">{pxH}</span> px
        </span>
        <div className="flex items-center gap-2">
          <button type="button" className="text-gold hover:underline" onClick={onReset}>
            Restablecer
          </button>
          <span className="text-line-strong">|</span>
          <button
            type="button"
            className="text-gold hover:underline"
            onClick={() => onChange({ x: 0, y: 0, w: 1, h: 1 })}
          >
            Toda la imagen
          </button>
        </div>
      </div>

      <div className="flex max-h-[62vh] justify-center overflow-hidden rounded-lg border border-line bg-black/30">
        <div
          ref={wrapRef}
          className={`relative inline-block max-w-full touch-none select-none ${dragging ? "cursor-grabbing" : ""}`}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <img
            src={src}
            alt="Captura para recortar"
            className="block h-auto max-h-[62vh] w-auto max-w-full"
            draggable={false}
          />
          {/* dim outside the crop */}
          <div
            data-crop="1"
            className="absolute cursor-move border border-gold/90"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`,
              height: `${crop.h * 100}%`,
              boxShadow: "0 0 0 9999px rgba(5, 7, 11, 0.62)",
            }}
          >
            <div className="pointer-events-none absolute inset-0 opacity-50">
              <div className="absolute inset-y-0 left-1/3 w-px bg-gold/50" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-gold/50" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-gold/50" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-gold/50" />
            </div>
            <span className="pointer-events-none absolute -top-6 left-0 rounded-sm bg-gold px-1.5 py-0.5 font-display text-[0.58rem] font-bold tracking-widest text-black">
              CROP
            </span>
            {handles().map((h) => (
              <Handle key={h.mode} mode={h.mode} style={h.style} />
            ))}
          </div>
        </div>
      </div>
      <p className="text-[0.68rem] leading-relaxed text-muted/80">
        Arrastra los tiradores con el dedo o el ratón. En escritorio también puedes ajustar con las
        flechas del teclado (Shift = paso grande).
      </p>
    </div>
  );
}

function Handle({ mode, style }: { mode: Handle; style: React.CSSProperties }) {
  return (
    <span
      data-handle={mode}
      style={style}
      className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 border border-gold bg-bg/80 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
    />
  );
}

function handles(): { mode: Handle; style: React.CSSProperties }[] {
  return [
    { mode: "nw", style: { left: "0%", top: "0%", cursor: "nwse-resize" } },
    { mode: "n", style: { left: "50%", top: "0%", cursor: "ns-resize" } },
    { mode: "ne", style: { left: "100%", top: "0%", cursor: "nesw-resize" } },
    { mode: "e", style: { left: "100%", top: "50%", cursor: "ew-resize" } },
    { mode: "se", style: { left: "100%", top: "100%", cursor: "nwse-resize" } },
    { mode: "s", style: { left: "50%", top: "100%", cursor: "ns-resize" } },
    { mode: "sw", style: { left: "0%", top: "100%", cursor: "nesw-resize" } },
    { mode: "w", style: { left: "0%", top: "50%", cursor: "ew-resize" } },
  ];
}

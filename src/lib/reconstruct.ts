import { CLASSES } from "./classes";
import type { Detection, LineResult } from "./types";

export interface ReconstructOptions {
  /** Interpret an isolated 'A' at a word/line end as a period (font merges both glyphs). */
  periodHeuristic: boolean;
  /** Gap (in character widths) that becomes a space. */
  spaceFactor: number;
  /** Vertical tolerance (in character heights) for grouping a line. */
  lineTolerance: number;
}

export const DEFAULT_RECONSTRUCT: ReconstructOptions = {
  periodHeuristic: true,
  spaceFactor: 0.40,
  lineTolerance: 0.65,
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Drop duplicate boxes produced by overlapping windows (same glyph twice). */
export function dedupeDetections(detections: Detection[]): Detection[] {
  const sorted = [...detections]
    .filter((d) => (d.x1 - d.x0) / Math.max(1, d.y1 - d.y0) <= 2.0)
    .sort((a, b) => b.confidence - a.confidence);
  const keep: Detection[] = [];
  for (const d of sorted) {
    const wd = Math.max(1, d.x1 - d.x0);
    const cx = (d.x0 + d.x1) / 2;
    let dup = false;
    for (const k of keep) {
      const wk = Math.max(1, k.x1 - k.x0);
      const kx = (k.x0 + k.x1) / 2;
      const hd = Math.max(1, d.y1 - d.y0);
      const hk = Math.max(1, k.y1 - k.y0);
      const cy = (d.y0 + d.y1) / 2;
      const ky = (k.y0 + k.y1) / 2;
      const closeX = Math.abs(cx - kx) < 0.35 * Math.max(wd, wk);
      const closeY = Math.abs(cy - ky) < 0.4 * Math.max(hd, hk);
      if (closeX && closeY) { dup = true; break; }
    }
    if (!dup) keep.push(d);
  }
  return keep;
}

interface WorkingLine {
  cy: number;
  height: number;
  items: Detection[];
}

/** Group character detections into visual lines and reconstruct reading order. */
export function reconstruct(rawDetections: Detection[], opts: ReconstructOptions = DEFAULT_RECONSTRUCT): LineResult[] {
  const detections = dedupeDetections(rawDetections);
  if (!detections.length) return [];
  const height = median(detections.map((d) => d.y1 - d.y0)) || 1;
  const tol = Math.max(2, height * opts.lineTolerance);

  const lines: WorkingLine[] = [];
  const sorted = [...detections].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  for (const det of sorted) {
    const cy = (det.y0 + det.y1) / 2;
    let best: WorkingLine | null = null;
    let bestDist = Infinity;
    for (const line of lines) {
      const dist = Math.abs(line.cy - cy);
      if (dist <= tol && dist < bestDist) {
        best = line;
        bestDist = dist;
      }
    }
    if (best) {
      best.items.push(det);
      const n = best.items.length;
      best.cy = (best.cy * (n - 1) + cy) / n;
      best.height = median(best.items.map((d) => d.y1 - d.y0));
    } else {
      lines.push({ cy, height: det.y1 - det.y0, items: [det] });
    }
  }
  lines.sort((a, b) => a.cy - b.cy);

  const results: LineResult[] = [];
  for (const line of lines) {
    const items = [...line.items].sort((a, b) => a.x0 - b.x0);
    const medW = median(items.map((d) => d.x1 - d.x0)) || line.height;
    const spaceGap = medW * opts.spaceFactor;

    const chars: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const d = items[i];
      let ch = CLASSES[d.cls] ?? "?";

      const prev = items[i - 1];
      const next = items[i + 1];
      const gapBefore = prev ? d.x0 - prev.x1 : Infinity;
      const gapAfter = next ? next.x0 - d.x1 : Infinity;

      if (ch === "A" && opts.periodHeuristic) {
        const isolatedBefore = prev ? gapBefore > medW * 0.3 : false;
        const endAfter = next ? gapAfter > medW * 0.45 : true;
        const lineIsLong = items.length > 1;
        if (lineIsLong && isolatedBefore && endAfter) ch = ".";
      }

      if (prev) {
        const gap = d.x0 - prev.x1;
        if (gap > spaceGap) {
          const spaces = gap > spaceGap * 2.6 ? 2 : 1;
          chars.push(" ".repeat(spaces));
        }
      }
      chars.push(ch);
    }

    results.push({
      text: chars.join("").replace(/\s+$/g, ""),
      detections: items,
      cy: line.cy,
    });
  }
  return results;
}

/** Sort detections into natural reading order (top-to-bottom, left-to-right). */
export function readingOrder(detections: Detection[], opts: ReconstructOptions = DEFAULT_RECONSTRUCT): Detection[] {
  return reconstruct(detections, opts).flatMap((l) => l.detections);
}

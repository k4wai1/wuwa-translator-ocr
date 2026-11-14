import * as ort from "onnxruntime-web/wasm";
import meta from "./model-meta.json";
import { CLASSES } from "./classes";
import { reconstruct } from "./reconstruct";
import type { Detection, OcrResult } from "./types";

export interface OcrOptions {
  confidence: number;
  iou: number;
  periodHeuristic: boolean;
  maxDetections: number;
}

export const DEFAULT_OCR: OcrOptions = {
  confidence: 0.25,
  iou: 0.45,
  periodHeuristic: true,
  maxDetections: 350,
};

export interface ModelInfo {
  imgsz: number;
  bytes: number;
  backend: string;
  inputName: string;
  outputName: string;
  arch: string;
  stride: number;
  numClasses: number;
}

export type SessionBundle = { session: ort.InferenceSession; info: ModelInfo };

export interface ClassifierBundle {
  session: ort.InferenceSession;
  imgsz: number;
  inputName: string;
  outputName: string;
}

let sessionPromise: Promise<{ session: ort.InferenceSession; info: ModelInfo }> | null = null;
let classifierPromise: Promise<ClassifierBundle | null> | null = null;

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
ort.env.wasm.proxy = false;
ort.env.logLevel = "error";

export function modelUrl(): string {
  return `${import.meta.env.BASE_URL}models/model.onnx`;
}

async function fetchModel(onProgress?: (ratio: number, loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(modelUrl(), { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`MODEL_MISSING:${res.status}`);
  }
  const total = Number(res.headers.get("content-length") || 0);
  if (!res.body) return res.arrayBuffer();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      if (onProgress) onProgress(total ? loaded / total : 0, loaded, total);
    }
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

export async function loadModel(
  onProgress?: (ratio: number, loaded: number, total: number) => void,
): Promise<{ session: ort.InferenceSession; info: ModelInfo }> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const buffer = await fetchModel(onProgress);
    const session = await ort.InferenceSession.create(buffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
      executionMode: "sequential",
    });
    const info: ModelInfo = {
      imgsz: (meta.imgsz as number) || 192,
      bytes: buffer.byteLength,
      backend: "wasm",
      inputName: session.inputNames[0],
      outputName: session.outputNames[0],
      arch: (meta.arch as string) || "chargen",
      stride: (meta.stride as number) || 4,
      numClasses: (meta.numClasses as number) || CLASSES.length,
    };
    return { session, info };
  })().catch((err) => {
    sessionPromise = null;
    throw err;
  });
  return sessionPromise;
}

export function resetModelCache(): void {
  sessionPromise = null;
  classifierPromise = null;
}

/** Optional second-stage glyph classifier (trained on clean GT crops). */
export async function loadClassifier(): Promise<ClassifierBundle | null> {
  if (classifierPromise) return classifierPromise;
  classifierPromise = (async () => {
    const cfg = (meta as { classifier?: { imgsz?: number; inputName?: string; outputName?: string } })
      .classifier;
    const res = await fetch(`${import.meta.env.BASE_URL}models/classifier.onnx`, { cache: "force-cache" });
    if (!res.ok) return null;
    const session = await ort.InferenceSession.create(await res.arrayBuffer(), {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    return {
      session,
      imgsz: cfg?.imgsz ?? 24,
      inputName: session.inputNames[0],
      outputName: session.outputNames[0],
    };
  })().catch(() => null);
  return classifierPromise;
}

function letterbox(src: HTMLCanvasElement, size: number): {
  canvas: HTMLCanvasElement;
  scale: number;
  padX: number;
  padY: number;
} {
  const scale = Math.min(size / src.width, size / src.height);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const padX = Math.floor((size - w) / 2);
  const padY = Math.floor((size - h) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, src.width, src.height, padX, padY, w, h);
  return { canvas, scale, padX, padY };
}

function toTensor(canvas: HTMLCanvasElement): ort.Tensor {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, w, h);
  const area = w * h;
  const out = new Float32Array(area * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    out[j] = data[i] / 255;
    out[area + j] = data[i + 1] / 255;
    out[area * 2 + j] = data[i + 2] / 255;
  }
  return new ort.Tensor("float32", out, [1, 3, h, w]);
}

function iou(a: Detection, b: Detection): number {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (inter <= 0) return 0;
  const areaA = Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0));
  const areaB = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
  return inter / (areaA + areaB - inter);
}

function nms(dets: Detection[], iouThreshold: number, maxDetections: number, classAware = true): Detection[] {
  const sorted = [...dets].sort((a, b) => b.confidence - a.confidence);
  const keep: Detection[] = [];
  for (const d of sorted) {
    let ok = true;
    for (const k of keep) {
      if ((!classAware || k.cls === d.cls) && iou(k, d) > iouThreshold) {
        ok = false;
        break;
      }
    }
    if (ok) {
      keep.push(d);
      if (keep.length >= maxDetections) break;
    }
  }
  return keep;
}

function decodeYolo(
  output: ort.Tensor,
  origW: number,
  origH: number,
  scale: number,
  padX: number,
  padY: number,
  confidence: number,
): Detection[] {
  const dims = output.dims as number[];
  const data = output.data as Float32Array;
  const numClasses = CLASSES.length;
  const expected = 4 + numClasses;

  let channels = 0;
  let anchors = 0;
  let transposed = false;
  if (dims.length === 3) {
    if (dims[1] === expected) {
      channels = dims[1];
      anchors = dims[2];
    } else if (dims[2] === expected) {
      channels = dims[2];
      anchors = dims[1];
      transposed = true;
    } else {
      throw new Error(`Forma de salida ONNX inesperada: [${dims.join(", ")}]`);
    }
  } else if (dims.length === 2) {
    if (dims[0] === expected) {
      channels = dims[0];
      anchors = dims[1];
    } else if (dims[1] === expected) {
      channels = dims[1];
      anchors = dims[0];
      transposed = true;
    }
  } else {
    throw new Error(`Forma de salida ONNX inesperada: [${dims.join(", ")}]`);
  }

  const at = (anchor: number, channel: number) =>
    transposed ? data[anchor * channels + channel] : data[channel * anchors + anchor];

  const dets: Detection[] = [];
  for (let i = 0; i < anchors; i++) {
    let best = -1;
    let bestScore = 0;
    for (let k = 0; k < numClasses; k++) {
      const s = at(i, 4 + k);
      if (s > bestScore) {
        bestScore = s;
        best = k;
      }
    }
    if (best < 0 || bestScore < confidence) continue;
    const cx = at(i, 0);
    const cy = at(i, 1);
    const bw = at(i, 2);
    const bh = at(i, 3);
    if (!Number.isFinite(cx + cy + bw + bh) || bw <= 0 || bh <= 0) continue;

    const x0 = (cx - bw / 2 - padX) / scale;
    const y0 = (cy - bh / 2 - padY) / scale;
    const x1 = (cx + bw / 2 - padX) / scale;
    const y1 = (cy + bh / 2 - padY) / scale;
    // Discard boxes that land (almost) entirely outside the crop.
    if (x1 < 0 || y1 < 0 || x0 > origW || y0 > origH) continue;
    const cx0 = Math.max(0, x0);
    const cy0 = Math.max(0, y0);
    const cx1 = Math.min(origW - 1, x1);
    const cy1 = Math.min(origH - 1, y1);
    if (cx1 - cx0 < 2 || cy1 - cy0 < 2) continue;
    dets.push({
      cls: best,
      letter: CLASSES[best],
      confidence: bestScore,
      x0: cx0,
      y0: cy0,
      x1: cx1,
      y1: cy1,
    });
  }
  return dets;
}

/**
 * Decode the lightweight SolarisCharNet output:
 * [1, 1 + 45 + 4, H, W] with objectness, class logits and box regression.
 */
function decodeChargen(
  output: ort.Tensor,
  origW: number,
  origH: number,
  scale: number,
  padX: number,
  padY: number,
  confidence: number,
  stride: number,
): Detection[] {
  const dims = output.dims as number[];
  if (dims.length !== 4) throw new Error(`Salida chargen inesperada: [${dims.join(", ")}]`);
  const [, channels, gh, gw] = dims;
  const data = output.data as Float32Array;
  const numClasses = channels - 1 - 4;
  const hw = gh * gw;
  const heat = new Float32Array(hw);
  for (let i = 0; i < hw; i++) {
    heat[i] = 1 / (1 + Math.exp(-data[i]));
  }
  const dets: Detection[] = [];
  const at = (c: number, i: number) => data[c * hw + i];

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const idx = gy * gw + gx;
      const p = heat[idx];
      if (p < confidence) continue;
      // 3x3 local-maximum check (equivalent to the Python decode).
      let peak = true;
      for (let dy = -1; dy <= 1 && peak; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const ny = gy + dy;
          const nx = gx + dx;
          if (ny < 0 || ny >= gh || nx < 0 || nx >= gw) continue;
          if (heat[ny * gw + nx] > p) {
            peak = false;
            break;
          }
        }
      }
      if (!peak) continue;

      let bestCls = 0;
      let bestLogit = -Infinity;
      let maxLogit = -Infinity;
      for (let k = 0; k < numClasses; k++) {
        const v = at(1 + k, idx);
        if (v > bestLogit) {
          bestLogit = v;
          bestCls = k;
        }
        if (v > maxLogit) maxLogit = v;
      }
      let sum = 0;
      for (let k = 0; k < numClasses; k++) sum += Math.exp(at(1 + k, idx) - maxLogit);
      const clsProb = Math.exp(bestLogit - maxLogit) / Math.max(1e-9, sum);
      const score = p * clsProb;
      if (score < confidence) continue;

      const dx = at(1 + numClasses, idx);
      const dy = at(2 + numClasses, idx);
      const logw = at(3 + numClasses, idx);
      const logh = at(4 + numClasses, idx);
      const cxL = (gx + 0.5 + dx) * stride;
      const cyL = (gy + 0.5 + dy) * stride;
      const bw = Math.exp(Math.max(-3, Math.min(3.5, logw))) * stride;
      const bh = Math.exp(Math.max(-3, Math.min(3.5, logh))) * stride;

      const x0 = (cxL - bw / 2 - padX) / scale;
      const y0 = (cyL - bh / 2 - padY) / scale;
      const x1 = (cxL + bw / 2 - padX) / scale;
      const y1 = (cyL + bh / 2 - padY) / scale;
      if (x1 < 0 || y1 < 0 || x0 > origW || y0 > origH) continue;
      const cx0 = Math.max(0, x0);
      const cy0 = Math.max(0, y0);
      const cx1 = Math.min(origW - 1, x1);
      const cy1 = Math.min(origH - 1, y1);
      if (cx1 - cx0 < 2 || cy1 - cy0 < 2) continue;
      dets.push({
        cls: bestCls,
        letter: CLASSES[bestCls],
        confidence: score,
        x0: cx0,
        y0: cy0,
        x1: cx1,
        y1: cy1,
      });
    }
  }
  return dets;
}

/** Run the detector over an already-preprocessed crop canvas. */
export async function runOcr(
  canvas: HTMLCanvasElement,
  opts: OcrOptions = DEFAULT_OCR,
  sessionBundle?: { session: ort.InferenceSession; info: ModelInfo },
): Promise<OcrResult> {
  const started = performance.now();
  const { session, info } = sessionBundle ?? (await loadModel());
  const raw = await runTiled(session, info, canvas, opts.confidence);
  const detections = nms(raw, opts.iou, opts.maxDetections, false);
  const classifier = await loadClassifier();
  if (classifier) await classifyDetections(canvas, detections, classifier);

  const lines = reconstruct(detections, {
    periodHeuristic: opts.periodHeuristic,
    spaceFactor: 0.34,
    lineTolerance: 0.65,
  });

  return {
    detections,
    lines,
    text: lines.map((l) => l.text).join("\n"),
    width: canvas.width,
    height: canvas.height,
    tookMs: performance.now() - started,
  };
}

/** Refine detector classes using the second-stage glyph classifier. */
async function classifyDetections(
  canvas: HTMLCanvasElement,
  dets: Detection[],
  clf: ClassifierBundle,
): Promise<void> {
  if (!dets.length) return;
  const S = clf.imgsz;
  const n = dets.length;
  const data = new Float32Array(n * 3 * S * S);
  const tmp = document.createElement("canvas");
  tmp.width = S;
  tmp.height = S;
  const ctx = tmp.getContext("2d", { willReadFrequently: true })!;
  for (let i = 0; i < n; i++) {
    const d = dets[i];
    const bw = Math.max(1, d.x1 - d.x0);
    const bh = Math.max(1, d.y1 - d.y0);
    const mx = bw * 0.12;
    const my = bh * 0.12;
    const x0 = Math.max(0, d.x0 - mx);
    const y0 = Math.max(0, d.y0 - my);
    const x1 = Math.min(canvas.width, d.x1 + mx);
    const y1 = Math.min(canvas.height, d.y1 + my);
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(canvas, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0), 0, 0, S, S);
    const px = ctx.getImageData(0, 0, S, S).data;
    const base = i * S * S;
    for (let j = 0; j < S * S; j++) {
      data[base + j] = px[j * 4] / 255;
      data[n * S * S + base + j] = px[j * 4 + 1] / 255;
      data[2 * n * S * S + base + j] = px[j * 4 + 2] / 255;
    }
  }
  const tensor = new ort.Tensor("float32", data, [n, 3, S, S]);
  const out = (await clf.session.run({ [clf.inputName]: tensor }))[clf.outputName];
  const nc = out.dims[1] as number;
  const logits = out.data as Float32Array;
  for (let i = 0; i < n; i++) {
    let best = 0;
    let max = -Infinity;
    for (let k = 0; k < nc; k++) {
      const v = logits[i * nc + k];
      if (v > max) { max = v; best = k; }
    }
    dets[i].cls = best;
    dets[i].letter = CLASSES[best] ?? "?";
  }
}

async function inferRegion(
  session: ort.InferenceSession,
  info: ModelInfo,
  region: HTMLCanvasElement,
  offX: number,
  offY: number,
  confidence: number,
): Promise<Detection[]> {
  const { canvas: lb, scale, padX, padY } = letterbox(region, info.imgsz);
  const res = await session.run({ [info.inputName]: toTensor(lb) });
  const output = res[info.outputName];
  const dims = output.dims as number[];
  const isChargen = dims.length === 4 && dims[1] === 1 + CLASSES.length + 4;
  const raw = isChargen
    ? decodeChargen(output, region.width, region.height, scale, padX, padY, confidence, info.stride)
    : decodeYolo(output, region.width, region.height, scale, padX, padY, confidence);
  for (const d of raw) {
    d.x0 += offX; d.x1 += offX; d.y0 += offY; d.y1 += offY;
  }
  return raw;
}

/** Tile large crops so glyphs keep the scale seen during training. */
async function runTiled(
  session: ort.InferenceSession,
  info: ModelInfo,
  canvas: HTMLCanvasElement,
  confidence: number,
): Promise<Detection[]> {
  const S = info.imgsz, w = canvas.width, h = canvas.height;
  if (Math.max(w, h) <= S * 1.35) {
    return inferRegion(session, info, canvas, 0, 0, confidence);
  }
  const step = Math.max(1, Math.floor(S * 0.72));
  const xs: number[] = [], ys: number[] = [];
  for (let x = 0; x < w; x += step) {
    const v = Math.min(x, Math.max(0, w - S));
    xs.push(v);
    if (v + S >= w) break;
  }
  for (let y = 0; y < h; y += step) {
    const v = Math.min(y, Math.max(0, h - S));
    ys.push(v);
    if (v + S >= h) break;
  }
  const all: Detection[] = [];
  const tw = Math.min(S, w), th = Math.min(S, h);
  const tile = document.createElement("canvas");
  tile.width = tw; tile.height = th;
  const tctx = tile.getContext("2d", { willReadFrequently: true })!;
  for (const y0 of ys) {
    for (const x0 of xs) {
      tctx.clearRect(0, 0, tw, th);
      tctx.drawImage(canvas, x0, y0, tw, th, 0, 0, tw, th);
      all.push(...(await inferRegion(session, info, tile, x0, y0, confidence)));
    }
  }
  return all;
}

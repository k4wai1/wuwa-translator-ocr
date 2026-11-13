import * as ort from "onnxruntime-web";
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
}

export type SessionBundle = { session: ort.InferenceSession; info: ModelInfo };

let sessionPromise: Promise<{ session: ort.InferenceSession; info: ModelInfo }> | null = null;

ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
ort.env.wasm.proxy = false;
ort.env.logLevel = "error";
// Served from public/ort via scripts/copy-ort.mjs (no CDN, works offline).
ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;

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
      imgsz: (meta.imgsz as number) || 416,
      bytes: buffer.byteLength,
      backend: "wasm",
      inputName: session.inputNames[0],
      outputName: session.outputNames[0],
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

function nms(dets: Detection[], iouThreshold: number, maxDetections: number): Detection[] {
  const sorted = [...dets].sort((a, b) => b.confidence - a.confidence);
  const keep: Detection[] = [];
  for (const d of sorted) {
    let ok = true;
    for (const k of keep) {
      if (k.cls === d.cls && iou(k, d) > iouThreshold) {
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

function decode(
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

/** Run the YOLO detector over an already-preprocessed crop canvas. */
export async function runOcr(
  canvas: HTMLCanvasElement,
  opts: OcrOptions = DEFAULT_OCR,
  sessionBundle?: { session: ort.InferenceSession; info: ModelInfo },
): Promise<OcrResult> {
  const started = performance.now();
  const { session, info } = sessionBundle ?? (await loadModel());
  const { canvas: lb, scale, padX, padY } = letterbox(canvas, info.imgsz);
  const tensor = toTensor(lb);
  const feeds: Record<string, ort.Tensor> = { [info.inputName]: tensor };
  const results = await session.run(feeds);
  const output = results[info.outputName];
  const raw = decode(output, canvas.width, canvas.height, scale, padX, padY, opts.confidence);
  const detections = nms(raw, opts.iou, opts.maxDetections);

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

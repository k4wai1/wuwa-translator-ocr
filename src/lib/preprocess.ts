/** Canvas-based image preprocessing: CLAHE, adaptive threshold, Sobel, etc. */

export type FilterMode = "original" | "grayscale" | "threshold" | "edges";

export interface FilterOptions {
  mode: FilterMode;
  brightness: number; // -100..100
  contrast: number; // -100..100
  clahe: boolean;
  claheClip: number; // 1..6
  thresholdBlock: number; // odd, 9..61
  thresholdC: number; // -10..20
  invert: boolean;
  sharpen: boolean;
}

export const DEFAULT_FILTERS: FilterOptions = {
  mode: "original",
  brightness: 0,
  contrast: 0,
  clahe: false,
  claheClip: 2.5,
  thresholdBlock: 31,
  thresholdC: 6,
  invert: false,
  sharpen: false,
};

export const FILTER_PRESETS: Record<string, Partial<FilterOptions>> = {
  original: { ...DEFAULT_FILTERS },
  auto: { mode: "grayscale", clahe: true, claheClip: 3.2, contrast: 18, brightness: 0, invert: false, sharpen: true },
  threshold: { mode: "threshold", clahe: true, claheClip: 2.5, thresholdBlock: 31, thresholdC: 6, invert: false, contrast: 0, brightness: 0, sharpen: false },
  edges: { mode: "edges", clahe: true, claheClip: 2.0, sharpen: false, invert: false, contrast: 0, brightness: 0 },
};

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Crop an HTMLImageElement into a canvas, optionally limiting its longest side. */
export function cropImage(
  img: HTMLImageElement,
  crop: { x: number; y: number; w: number; h: number },
  maxDim = 0,
): HTMLCanvasElement {
  const sx = crop.x * img.naturalWidth;
  const sy = crop.y * img.naturalHeight;
  const sw = Math.max(1, crop.w * img.naturalWidth);
  const sh = Math.max(1, crop.h * img.naturalHeight);
  let scale = 1;
  if (maxDim > 0 && Math.max(sw, sh) > maxDim) scale = maxDim / Math.max(sw, sh);
  const canvas = createCanvas(sw * scale, sh * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const dst = createCanvas(src.width, src.height);
  dst.getContext("2d")!.drawImage(src, 0, 0);
  return dst;
}

function luminance(data: Uint8ClampedArray): Float32Array {
  const n = data.length / 4;
  const g = new Float32Array(n);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return g;
}

/** Contrast-Limited Adaptive Histogram Equalization (8x8 tiles by default). */
export function clahe(gray: Float32Array, w: number, h: number, clip = 2.5, tiles = 8): Float32Array {
  const tw = Math.max(1, Math.floor(w / tiles));
  const th = Math.max(1, Math.floor(h / tiles));
  const lut = new Float32Array(tiles * tiles * 256);
  const tileArea = tw * th;
  const limit = Math.max(1, (clip * tileArea) / 256);

  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const x0 = tx * tw;
      const y0 = ty * th;
      const x1 = tx === tiles - 1 ? w : x0 + tw;
      const y1 = ty === tiles - 1 ? h : y0 + th;
      const hist = new Uint32Array(256);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) {
          hist[Math.min(255, Math.max(0, gray[row + x] | 0))]++;
          count++;
        }
      }
      // Clip and redistribute the excess uniformly.
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) {
          excess += hist[i] - limit;
          hist[i] = limit;
        }
      }
      const bonus = excess / 256;
      const cdf = new Float32Array(256);
      let acc = 0;
      for (let i = 0; i < 256; i++) {
        acc += hist[i] + bonus;
        cdf[i] = acc / Math.max(1, count);
      }
      const base = (ty * tiles + tx) * 256;
      for (let i = 0; i < 256; i++) lut[base + i] = cdf[i] * 255;
    }
  }

  const out = new Float32Array(w * h);
  const fx = (w - 1) / Math.max(1, tiles - 1);
  const fy = (h - 1) / Math.max(1, tiles - 1);
  for (let y = 0; y < h; y++) {
    let gy = y / fy;
    const y0 = Math.min(tiles - 1, Math.floor(gy));
    const y1 = Math.min(tiles - 1, y0 + 1);
    const wy = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = x / fx;
      const x0 = Math.min(tiles - 1, Math.floor(gx));
      const x1 = Math.min(tiles - 1, x0 + 1);
      const wx = gx - x0;
      const v = Math.min(255, Math.max(0, gray[y * w + x] | 0));
      const a = lut[(y0 * tiles + x0) * 256 + v];
      const b = lut[(y0 * tiles + x1) * 256 + v];
      const c = lut[(y1 * tiles + x0) * 256 + v];
      const d = lut[(y1 * tiles + x1) * 256 + v];
      out[y * w + x] = (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy;
    }
  }
  return out;
}

/** Adaptive mean threshold using an integral image. */
export function adaptiveThreshold(
  gray: Float32Array,
  w: number,
  h: number,
  block: number,
  c: number,
): Uint8Array {
  const bs = Math.max(3, block | 1);
  const r = Math.floor(bs / 2);
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const mean = sum / area;
      out[y * w + x] = gray[y * w + x] > mean - c ? 255 : 0;
    }
  }
  return out;
}

/** Sobel gradient magnitude, normalised to 0..255. */
export function sobel(gray: Float32Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  let max = 1;
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1], tc = gray[i - w], tr = gray[i - w + 1];
      const ml = gray[i - 1], mr = gray[i + 1];
      const bl = gray[i + w - 1], bc = gray[i + w], br = gray[i + w + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > max) max = m;
    }
  }
  const scale = 255 / max;
  for (let i = 0; i < mag.length; i++) out[i] = Math.min(255, mag[i] * scale);
  return out;
}

function boxBlur(data: Uint8ClampedArray, w: number, h: number, radius = 1): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(data.length);
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        const i = (y * w + xx) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      const i = (y * w + x) * 4;
      tmp[i] = r / n; tmp[i + 1] = g / n; tmp[i + 2] = b / n; tmp[i + 3] = 255;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        const i = (yy * w + x) * 4;
        r += tmp[i]; g += tmp[i + 1]; b += tmp[i + 2]; n++;
      }
      const i = (y * w + x) * 4;
      out[i] = r / n; out[i + 1] = g / n; out[i + 2] = b / n; out[i + 3] = 255;
    }
  }
  return out;
}

/** Apply the full preprocessing pipeline. Returns a new canvas. */
export function processCanvas(src: HTMLCanvasElement, opts: FilterOptions): HTMLCanvasElement {
  const dst = createCanvas(src.width, src.height);
  const ctx = dst.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const w = dst.width;
  const h = dst.height;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  // Brightness / contrast on RGB (Pillow-style contrast factor).
  const c = Math.max(-255, Math.min(255, opts.contrast * 2.55));
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  const bright = opts.brightness * 2.55;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = factor * (data[i] - 128) + 128 + bright;
    data[i + 1] = factor * (data[i + 1] - 128) + 128 + bright;
    data[i + 2] = factor * (data[i + 2] - 128) + 128 + bright;
  }

  let gray = luminance(data);
  if (opts.clahe) gray = clahe(gray, w, h, opts.claheClip);

  if (opts.mode === "threshold") {
    const bin = adaptiveThreshold(gray, w, h, opts.thresholdBlock, opts.thresholdC);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const v = opts.invert ? 255 - bin[j] : bin[j];
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
    }
  } else if (opts.mode === "edges") {
    const ed = sobel(gray, w, h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const v = opts.invert ? 255 - ed[j] : ed[j];
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
    }
  } else if (opts.mode === "grayscale") {
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const v = opts.invert ? 255 - gray[j] : gray[j];
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
    }
  } else {
    // Preserve colour: apply CLAHE as a luminance delta.
    if (opts.clahe) {
      const base = luminance(data);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const d = gray[j] - base[j];
        data[i] += d; data[i + 1] += d; data[i + 2] += d;
      }
    }
    if (opts.invert) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
    }
  }

  if (opts.sharpen) {
    const blurred = boxBlur(data, w, h, 1);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i] + (data[i] - blurred[i]) * 0.85;
      data[i + 1] = data[i + 1] + (data[i + 1] - blurred[i + 1]) * 0.85;
      data[i + 2] = data[i + 2] + (data[i + 2] - blurred[i + 2]) * 0.85;
    }
  }

  ctx.putImageData(img, 0, 0);
  return dst;
}

export interface ImageStats {
  mean: number;
  std: number;
  p5: number;
  p95: number;
  dynamicRange: number;
}

export function analyzeCanvas(canvas: HTMLCanvasElement): ImageStats {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hist = new Uint32Array(256);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[l]++;
    sum += l;
    sumSq += l * l;
    n++;
  }
  const mean = sum / Math.max(1, n);
  const std = Math.sqrt(Math.max(0, sumSq / Math.max(1, n) - mean * mean));
  const percentile = (p: number) => {
    const target = n * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i;
    }
    return 255;
  };
  const p5 = percentile(0.05);
  const p95 = percentile(0.95);
  return { mean, std, p5, p95, dynamicRange: p95 - p5 };
}

/** Suggest a preprocessing configuration based on the crop's histogram. */
export function autoEnhance(canvas: HTMLCanvasElement): FilterOptions {
  const s = analyzeCanvas(canvas);
  const next: FilterOptions = { ...DEFAULT_FILTERS, clahe: true, claheClip: 3.0, sharpen: true };
  if (s.dynamicRange < 70 || s.std < 26) {
    // Very flat / same-tone text: grayscale + strong contrast.
    next.mode = "grayscale";
    next.contrast = 28;
    next.claheClip = 3.6;
  } else if (s.mean < 90) {
    next.mode = "grayscale";
    next.contrast = 14;
    next.brightness = 8;
  } else {
    next.mode = "original";
    next.contrast = 10;
  }
  return next;
}

/** Small preview helper that keeps the canvas under maxDim on its longest side. */
export function scaledPreview(src: HTMLCanvasElement, maxDim = 1100): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  const c = createCanvas(src.width * scale, src.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

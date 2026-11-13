export interface Detection {
  cls: number;
  letter: string;
  confidence: number;
  /** Pixel coordinates relative to the scanned crop. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LineResult {
  text: string;
  detections: Detection[];
  /** y center of the line in crop pixels. */
  cy: number;
}

export interface OcrResult {
  detections: Detection[];
  lines: LineResult[];
  text: string;
  /** Crop dimensions the coordinates refer to. */
  width: number;
  height: number;
  tookMs: number;
}

export interface ModelProgress {
  loaded: number;
  total: number;
  ratio: number;
}

export type ModelState =
  | { status: "idle" }
  | { status: "loading"; progress: number; label: string }
  | { status: "ready"; backend: string; bytes: number }
  | { status: "missing"; message: string }
  | { status: "error"; message: string };

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

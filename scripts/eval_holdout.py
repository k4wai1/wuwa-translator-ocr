#!/usr/bin/env python3
"""Blind evaluation on ./Holdout_5 (the ONLY script allowed to read it).

It reproduces the browser pipeline in numpy with the exported ONNX models:
  luminance + CLAHE(2.2) + p2..p98 stretch
  -> proportional rescale + 192 px sliding windows (step 112)
  -> detector -> class-agnostic NMS(0.4) -> cross-window dedup
  -> 32x32 classifier with p5..p95 per-crop normalization (class 45 = reject)
  -> line grouping + space insertion.

Usage: python scripts/eval_holdout.py [--dir Holdout_5] [--conf 0.30]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent.parent
CLASSES = [chr(c) for c in range(65, 91)] + [str(d) for d in range(10)] + list("()-,/:;[]")
NOISE = len(CLASSES)


def clahe_luma(bgr: np.ndarray, clip: float = 2.2) -> np.ndarray:
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    g = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(g)
    p2, p98 = np.percentile(g, (2, 98))
    if p98 - p2 < 8:
        p2, p98 = 0.0, 255.0
    g = np.clip((g.astype(np.float32) - p2) / max(1.0, p98 - p2) * 255.0, 0, 255)
    return cv2.cvtColor(g.astype(np.uint8), cv2.COLOR_GRAY2BGR)


def decode(output: np.ndarray, imgsz: int, conf: float, iou: float = 0.4):
    from chargen import decode_numpy
    return decode_numpy(output, imgsz, conf=conf, iou=iou, max_det=250)


def nms_agnostic(boxes, scores, iou_thr=0.4):
    if not len(boxes):
        return np.zeros((0,), np.int64)
    order = np.argsort(-scores)
    keep = []
    for i in order:
        ok = True
        for j in keep:
            x0, y0 = max(boxes[i, 0], boxes[j, 0]), max(boxes[i, 1], boxes[j, 1])
            x1, y1 = min(boxes[i, 2], boxes[j, 2]), min(boxes[i, 3], boxes[j, 3])
            inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
            a = (boxes[i, 2] - boxes[i, 0]) * (boxes[i, 3] - boxes[i, 1])
            b = (boxes[j, 2] - boxes[j, 0]) * (boxes[j, 3] - boxes[j, 1])
            if inter / max(1e-6, a + b - inter) > iou_thr:
                ok = False
                break
        if ok:
            keep.append(i)
    return np.asarray(keep, np.int64)


def dedupe(boxes, scores, classes):
    keep_aspect = (boxes[:, 2] - boxes[:, 0]) / np.maximum(1.0, boxes[:, 3] - boxes[:, 1]) <= 2.0
    boxes, scores, classes = boxes[keep_aspect], scores[keep_aspect], classes[keep_aspect]
    order = np.argsort(-scores)
    keep: list[int] = []
    for i in order:
        wd = boxes[i, 2] - boxes[i, 0]
        cx = (boxes[i, 0] + boxes[i, 2]) / 2
        dup = False
        cy = (boxes[i, 1] + boxes[i, 3]) / 2
        hd = boxes[i, 3] - boxes[i, 1]
        for j in keep:
            wk = boxes[j, 2] - boxes[j, 0]
            hk = boxes[j, 3] - boxes[j, 1]
            kx = (boxes[j, 0] + boxes[j, 2]) / 2
            ky = (boxes[j, 1] + boxes[j, 3]) / 2
            if abs(cx - kx) < 0.35 * max(wd, wk) and abs(cy - ky) < 0.4 * max(hd, hk):
                dup = True
                break
        if not dup:
            keep.append(i)
    return np.asarray(keep, np.int64)


def crop_square(img, b, margin=0.15):
    h, w = img.shape[:2]
    bw, bh = b[2] - b[0], b[3] - b[1]
    side = max(bw, bh) * (1 + margin)
    cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    x0, y0 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
    x1, y1 = int(min(w, cx + side / 2)), int(min(h, cy + side / 2))
    if x1 - x0 < 3 or y1 - y0 < 3:
        return None
    return img[y0:y1, x0:x1]


def normalize_patch(patch):
    g = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY).astype(np.float32)
    p5, p95 = np.percentile(g, (5, 95))
    g = np.clip((g - p5) / max(float(p95 - p5), 10.0), 0.0, 1.0)
    return np.repeat(g[:, :, None], 3, axis=2)


def estimate_glyph_scale(img):
    """Same heuristic as the browser: median text-band height -> glyph scale."""
    h, w = img.shape[:2]
    s = min(1.0, 320.0 / max(1, w))
    nw, nh = max(8, round(w * s)), max(8, round(h * s))
    g = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (nw, nh),
                   interpolation=cv2.INTER_AREA).astype(np.float32)
    gx = np.abs(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3))
    gy = np.abs(cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3))
    rows = gx.mean(axis=1) + gy.mean(axis=1)
    mx = float(rows.max())
    if mx <= 1e-3:
        return 1.0
    thr = mx * 0.35
    bands, start = [], -1
    for y in range(1, nh - 1):
        on = rows[y] >= thr
        if on and start < 0:
            start = y
        if not on and start >= 0:
            if y - start >= 2:
                bands.append(y - start)
            start = -1
    if start >= 0:
        bands.append(nh - 1 - start)
    if not bands:
        return 1.0
    bands.sort()
    med = bands[len(bands) // 2] / s
    return float(np.clip(32.0 / max(8.0, med), 0.25, 3.0))


def run_image(path: Path, det, clf, conf: float, imgsz: int = 192):
    raw = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if raw is None:
        return [], None
    img = raw
    h, w = img.shape[:2]
    max_dim = max(w, h)
    fit = min(1.0, 1800.0 / max_dim)
    base = [1.0] if max_dim > 700 else [1.0, 1.5]
    scales = []
    for v in base:
        v *= fit
        if v not in scales:
            scales.append(v)

    all_b, all_s, all_c = [], [], []
    step = imgsz - 80
    for scale in scales:
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
        scaled = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
        xs = list(range(0, max(1, nw - imgsz + 1), step)) or [0]
        ys = list(range(0, max(1, nh - imgsz + 1), step)) or [0]
        if xs[-1] != max(0, nw - imgsz):
            xs.append(max(0, nw - imgsz))
        if ys[-1] != max(0, nh - imgsz):
            ys.append(max(0, nh - imgsz))
        if len(xs) * len(ys) > 60:
            keep = max(1, 60 // max(1, len(ys)))
            stride = max(1, int(np.ceil((nw - min(imgsz, nw)) / max(1, keep - 1))))
            xs = list(range(0, max(1, nw - imgsz + 1), stride)) or [0]
            if xs[-1] != max(0, nw - imgsz):
                xs.append(max(0, nw - imgsz))
        for y0 in ys:
            for x0 in xs:
                tile = scaled[y0:y0 + imgsz, x0:x0 + imgsz]
                if tile.shape[0] < imgsz or tile.shape[1] < imgsz:
                    t = np.full((imgsz, imgsz, 3), 114, np.uint8)
                    t[:tile.shape[0], :tile.shape[1]] = tile
                    tile = t
                tile = clahe_luma(tile)
                inp = cv2.cvtColor(tile, cv2.COLOR_BGR2RGB).astype(np.float32).transpose(2, 0, 1)[None] / 255
                out = det.run(None, {"images": inp})[0]
                b, sc, c = decode(out, imgsz, conf)
                if len(b):
                    b[:, [0, 2]] += x0
                    b[:, [1, 3]] += y0
                    all_b.append(b / scale); all_s.append(sc); all_c.append(c)
    if not all_b:
        return [], raw
    boxes = np.concatenate(all_b)
    scores = np.concatenate(all_s)
    classes = np.concatenate(all_c).astype(np.int64)
    keep = nms_agnostic(boxes, scores, 0.4)
    boxes, scores, classes = boxes[keep], scores[keep], classes[keep]
    keep = dedupe(boxes, scores, classes)
    boxes, scores, classes = boxes[keep], scores[keep], classes[keep]

    if len(boxes):
        patches = []
        for b in boxes:
            p = crop_square(img, b)
            if p is None:
                p = np.zeros((4, 4, 3), np.uint8)
            patches.append(cv2.resize(normalize_patch(p), (32, 32), interpolation=cv2.INTER_AREA))
        arr = np.stack(patches).astype(np.float32).transpose(0, 3, 1, 2)
        chunks = []
        for k in range(0, arr.shape[0], 16):
            part = arr[k:k + 16]
            if part.shape[0] < 16:
                part = np.concatenate([part, np.repeat(part[:1], 16 - part.shape[0], axis=0)], axis=0)
            chunks.append(clf.run(None, {"images": part})[0][:min(16, arr.shape[0] - k)])
        logits = np.concatenate(chunks, axis=0)
        e = np.exp(logits - logits.max(1, keepdims=True))
        probs = e / e.sum(1, keepdims=True)
        best = probs.argmax(1)
        conf_c = probs.max(1)
        fused = np.sqrt(np.clip(scores * conf_c, 0, 1))
        # Same rule as the browser: the classifier decides the glyph, and
        # class 45 (noise/icon/partial) or a weak verdict drops the box.
        keep = (scores >= 0.45) & (best < NOISE) & (conf_c >= 0.35)
        boxes, scores, classes, fused = boxes[keep], scores[keep], best[keep], fused[keep]
        scores = fused

    return [(boxes[i], int(classes[i]), float(scores[i])) for i in range(len(boxes))], img


def group_lines(items, space_factor=0.40):
    if not items:
        return []
    hs = [b[3] - b[1] for b, _, _ in items]
    med_h = float(np.median(hs))
    items = sorted(items, key=lambda t: (t[0][1] + t[0][3]) / 2)
    lines: list[list] = []
    for it in items:
        cy = (it[0][1] + it[0][3]) / 2
        if lines and abs(lines[-1][-1][0][1] + lines[-1][-1][0][3] - 2 * cy) / 2 <= med_h * 0.65:
            lines[-1].append(it)
        else:
            lines.append([it])
    out = []
    for ln in lines:
        ln = sorted(ln, key=lambda t: t[0][0])
        ws = [b[2] - b[0] for b, _, _ in ln]
        med_w = float(np.median(ws))
        text = ""
        prev = None
        for b, c, _ in ln:
            if prev is not None and b[0] - prev > med_w * space_factor:
                text += " "
            text += CLASSES[c] if c < len(CLASSES) else "?"
            prev = b[2]
        out.append(text)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=str(ROOT / "Holdout_5"))
    ap.add_argument("--models", default=str(ROOT / "public" / "models"))
    ap.add_argument("--conf", type=float, default=0.30)
    ap.add_argument("--save", default=str(ROOT / "training" / "holdout_eval"))
    args = ap.parse_args()

    models = Path(args.models)
    det = ort.InferenceSession(str(models / "model.onnx"), providers=["CPUExecutionProvider"])
    clf = ort.InferenceSession(str(models / "classifier.onnx"), providers=["CPUExecutionProvider"])
    files = sorted(Path(args.dir).glob("*.*"))
    save_dir = Path(args.save)
    save_dir.mkdir(parents=True, exist_ok=True)
    report = []
    for f in files:
        items, raw = run_image(f, det, clf, args.conf)
        lines = group_lines(items)
        text = "\n".join(lines)
        print(f"[holdout] {f.name}: {len(items)} glifos -> {text!r}", flush=True)
        report.append({"file": f.name, "glyphs": len(items), "lines": lines, "text": text})
        if raw is not None:
            vis = raw.copy()
            for b, c, s in items:
                cv2.rectangle(vis, (int(b[0]), int(b[1])), (int(b[2]), int(b[3])), (0, 255, 0), 2)
            cv2.imwrite(str(save_dir / f"{f.stem}_pred.jpg"), vis)
    (save_dir / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"[holdout] report -> {save_dir/'report.json'}")


if __name__ == "__main__":
    main()

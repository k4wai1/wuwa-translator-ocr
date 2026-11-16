#!/usr/bin/env python3
"""Clean synthetic dataset generator for the Solaris-3 Script detector.

Design rules (enforced, not optional):
  * Canvas 192x192 (micro) with 1-2 horizontal text lines.
  * Glyph height 24-48 px (70%) or 14-22 px (30%). No 6 px squashed glyphs.
  * Rotation only -4..+4 deg (50% exactly 0), perspective jitter <= 0.015.
  * NO Otsu / adaptive threshold / Sobel: they destroyed the glyphs.
  * Guaranteed luminance contrast between glyph and its local background
    (>= 22/255), even for the "same tone" cases.
  * Backgrounds: smooth UI gradients, strongly blurred crops from Ejemplos,
    and UI panels with unlabeled distractor shapes (frames, >>, gears, dividers).
  * 50% of the lines come from a shuffled deck that contains every one of the
    45 classes the same number of times -> balanced class frequencies.
  * Blur sigma <= 0.7, no heavy noise.

Classes (45): A-Z, 0-9, ( ) , - / : ; [ ].
The period '.' shares the exact outline of 'A' and maps to class 'A'.
"""
from __future__ import annotations

import argparse
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = ROOT / "Solaris-3 Script.ttf"

PUNCT = ["(", ")", ",", "-", "/", ":", ";", "[", "]"]
CLASSES = [chr(c) for c in range(ord("A"), ord("Z") + 1)] + [str(d) for d in range(10)] + PUNCT
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}
ALLOWED = set(CLASSES) | {" ", "."}
PERIOD_IDX = CLASS_TO_IDX["A"]

CORPUS = [
    "RESONATOR", "SONATA EFFECT", "TUNE BREAK", "ECHO", "ENERGY", "CRIT RATE",
    "WUTHERING WAVES", "JINZHOU", "RINASCITA", "SOLARIS-3", "OPEN MAP", "QUEST",
    "INVENTORY", "CHARACTER", "WEAPON", "TEAM", "SETTINGS", "CONFIRM", "CANCEL",
    "CLAIM", "REWARDS", "LEVEL UP", "ASCENSION", "FORTE", "RESONANCE LIBERATION",
    "BASIC ATTACK", "HEAVY ATTACK", "DODGE", "PARRY", "DATA BANK", "TROPHIES",
    "ACHIEVEMENTS", "MAIL", "FRIENDS", "SHOP", "PURCHASE", "LIMITED", "EVENT",
    "LOGIN REWARDS", "STAMINA", "ASTRITE", "LUNITE", "SHELL CREDIT", "CAFE TEA",
    "WELCOME", "NO ENTRY", "DANGER", "INN", "TAVERN", "MARKET", "NOTICE",
    "PHARMACY", "BAKERY", "HOTEL", "PARKING", "LIBRARY", "MUSEUM", "BUS STOP",
    "LV 90", "HP 25000", "ATK 1200", "COST 4", "RANK S", "12:45", "3/4",
    "[LORE]", "(SOLARIS-3)", "ITEM 01: ECHO", "COST: 4", "N/A", "24/7",
    "THE WINDS REMEMBER", "BEYOND THE TIDE", "ECHOES OF THE PAST",
    "THE LAST SENTINEL", "THE ROAD HOME", "HOLD THE LINE", "KEEP MOVING FORWARD",
    "ARAN LUMEN", "KALOS TIDE", "VERAN SHORE", "SILENT PEAK", "GOLDEN HOUR",
    "CRIMSON MOON", "FROSTBOUND", "STARFALL", "ALEX", "PLEASE WAIT",
    "PLEASE SELECT", "TALK", "LEAVE", "ACCEPT", "DECLINE",
]

PALETTES = [
    ((11, 13, 18), (34, 38, 48), (212, 177, 112)),
    ((18, 22, 30), (52, 58, 72), (77, 238, 234)),
    ((24, 18, 14), (60, 46, 32), (232, 196, 140)),
    ((12, 26, 28), (34, 62, 64), (120, 230, 210)),
    ((28, 22, 38), (70, 56, 88), (210, 160, 230)),
    ((40, 32, 20), (235, 226, 205), (120, 84, 40)),
    ((245, 242, 232), (255, 252, 244), (150, 115, 60)),
    ((225, 228, 232), (250, 250, 252), (40, 52, 70)),
]

REAL_BG_CACHE: dict[str, np.ndarray] = {}


def sanitize(text: str) -> str:
    out = []
    for ch in text.upper():
        if ch in ALLOWED:
            out.append(ch)
        elif ch in "!?":
            out.append(".")
        else:
            out.append(" ")
    return " ".join("".join(out).split())


def lum(c) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def gradient_bg(h: int, w: int, c0, c1, angle: float) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = xx * math.cos(angle) + yy * math.sin(angle)
    t = (t - t.min()) / max(1e-6, t.max() - t.min())
    out = np.zeros((h, w, 3), np.float32)
    for k in range(3):
        out[..., k] = c0[k] + (c1[k] - c0[k]) * t
    return out


def list_real_backgrounds(bg_dir: Path) -> list[str]:
    if not bg_dir.exists():
        return []
    exts = ("*.jpg", "*.jpeg", "*.png")
    files: list[str] = []
    for e in exts:
        files += [str(p) for p in bg_dir.rglob(e)]
    return sorted(files)


def real_background(rng: random.Random, h: int, w: int, files: list[str]) -> np.ndarray | None:
    if not files:
        return None
    path = rng.choice(files)
    img = REAL_BG_CACHE.get(path)
    if img is None:
        img = cv2.imread(path, cv2.IMREAD_COLOR)
        if img is None:
            return None
        REAL_BG_CACHE[path] = img
        if len(REAL_BG_CACHE) > 24:
            REAL_BG_CACHE.pop(next(iter(REAL_BG_CACHE)))
    ih, iw = img.shape[:2]
    # Random crop with the canvas aspect ratio, then a heavy blur so no
    # unlabeled glyph from the screenshot survives.
    scale = max(w / iw, h / ih) * rng.uniform(1.0, 1.35)
    nw, nh = max(w, int(iw * scale)), max(h, int(ih * scale))
    crop = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    x = rng.randint(0, max(0, nw - w))
    y = rng.randint(0, max(0, nh - h))
    crop = crop[y:y + h, x:x + w]
    sigma = rng.uniform(4.5, 8.0)
    crop = cv2.GaussianBlur(crop, (0, 0), sigma)
    # Pull it towards a UI panel tone so text stays legible.
    tint = np.array(rng.choice([(0.55, 0.58, 0.64), (0.9, 0.9, 0.88), (0.35, 0.4, 0.48)]), np.float32)
    crop = np.clip(crop.astype(np.float32) * tint, 0, 255)
    return crop


def ui_panel(rng: random.Random, h: int, w: int) -> np.ndarray:
    pal = PALETTES[rng.randrange(len(PALETTES))]
    dark = rng.random() < 0.6
    c0 = np.array(pal[0] if dark else pal[1], np.float32)
    bg = gradient_bg(h, w, c0, c0 * rng.uniform(0.85, 1.15), rng.uniform(0, math.tau))
    overlay = np.zeros_like(bg)
    for _ in range(rng.randint(2, 5)):
        x0, y0 = rng.randint(-w // 6, w), rng.randint(-h // 6, h)
        pw, ph = rng.randint(w // 6, w // 2), rng.randint(h // 8, h // 2)
        col = np.array([rng.randint(10, 240) for _ in range(3)], np.float32)
        cv2.rectangle(overlay, (x0, y0), (x0 + pw, y0 + ph), col.tolist(), -1)
    overlay = cv2.GaussianBlur(overlay, (0, 0), rng.uniform(10, 24))
    bg = bg * 0.85 + overlay * rng.uniform(0.06, 0.18)
    return np.clip(bg, 0, 255)


def draw_ui_distractors(canvas: np.ndarray, rng: random.Random) -> None:
    """Unlabeled UI shapes: the detector must learn objectness = 0 on them."""
    h, w = canvas.shape[:2]
    accent = PALETTES[rng.randrange(len(PALETTES))][2]
    col = tuple(int(v * rng.uniform(0.45, 0.95)) for v in accent)
    for _ in range(rng.randint(2, 5)):
        kind = rng.randrange(5)
        x0 = rng.randint(4, max(5, w - 40))
        y0 = rng.randint(4, max(5, h - 40))
        ww = rng.randint(18, max(20, w // 3))
        hh = rng.randint(14, max(16, h // 4))
        x1, y1 = min(w - 2, x0 + ww), min(h - 2, y0 + hh)
        thick = rng.choice([1, 2])
        if kind == 0:
            cv2.rectangle(canvas, (x0, y0), (x1, y1), col, thick)
        elif kind == 1:
            cv2.ellipse(canvas, ((x0 + x1) // 2, (y0 + y1) // 2),
                        (max(6, ww // 2), max(5, hh // 2)), 0, 0, 360, col, thick)
        elif kind == 2:  # chevrons >>
            cy = (y0 + y1) // 2
            for k in range(2):
                bx = x0 + k * 10
                cv2.line(canvas, (bx, cy - 7), (bx + 8, cy), col, thick)
                cv2.line(canvas, (bx + 8, cy), (bx, cy + 7), col, thick)
        elif kind == 3:  # gear-ish polygon (fails as a glyph)
            ctr = ((x0 + x1) // 2, (y0 + y1) // 2)
            rad = max(6, min(ww, hh) // 2)
            pts = []
            for k in range(12):
                a = k * math.tau / 12
                r = rad if k % 2 == 0 else rad * 0.7
                pts.append([int(ctr[0] + r * math.cos(a)), int(ctr[1] + r * math.sin(a))])
            cv2.polylines(canvas, [np.array(pts, np.int32)], True, col, thick)
        else:  # divider + toggle pill
            cv2.line(canvas, (x0, y1), (x1, y1), col, 1)
            cv2.rectangle(canvas, (x0, y0), (x0 + 22, y0 + 10), col, thick)


def make_background(rng: random.Random, h: int, w: int,
                    real_files: list[str]) -> tuple[np.ndarray, bool]:
    r = rng.random()
    if r < 0.32:  # smooth gradient
        pal = PALETTES[rng.randrange(len(PALETTES))]
        dark = rng.random() < 0.65
        c0 = np.array(pal[0] if dark else pal[1], np.float32)
        c1 = np.array(pal[1] if dark else pal[0], np.float32)
        bg = gradient_bg(h, w, c0, c1, rng.uniform(0, math.tau))
        bg += np.random.default_rng(rng.randrange(1 << 30)).normal(0, 1.5, bg.shape)
        bg = np.clip(bg, 0, 255).astype(np.uint8)
        return bg, lum(bg.mean(axis=(0, 1))) < 128
    if r < 0.68:
        rb = real_background(rng, h, w, real_files)
        if rb is not None:
            rb = np.clip(rb, 0, 255).astype(np.uint8)
            return rb, lum(rb.mean(axis=(0, 1))) < 128
    bg = ui_panel(rng, h, w)
    bg = np.clip(bg, 0, 255).astype(np.uint8)
    return bg, lum(bg.mean(axis=(0, 1))) < 128


def balanced_lines(n: int, seed: int) -> list[str]:
    """Lines built from a shuffled deck with exactly equal class counts."""
    rng = random.Random(seed)
    repeats = max(1, (n * 10) // len(CLASSES) + 1)
    deck = CLASSES * repeats
    rng.shuffle(deck)
    lines, i = [], 0
    while i < len(deck) and len(lines) < n:
        k = rng.randint(3, 12)
        lines.append("".join(deck[i:i + k]))
        i += k
    return lines


def choose_line(rng: random.Random, balanced: str | None) -> str:
    if balanced is not None and rng.random() < 0.5:
        return sanitize(balanced)
    r = rng.random()
    if r < 0.55:
        return sanitize(rng.choice(CORPUS))
    if r < 0.8:
        n = rng.randint(3, 14)
        return "".join(rng.choice(CLASSES) for _ in range(n))
    if r < 0.9:
        return f"{rng.choice('ABCDXY')}{rng.choice('ABCDXY')}{rng.randint(0, 99):02d}"
    return "".join(rng.choice("0123456789") for _ in range(rng.randint(2, 6)))


def font_for_height(height: int, font_path: Path) -> ImageFont.FreeTypeFont:
    """Pick a font size whose cap height matches `height` px (approx)."""
    lo, hi, best = 8, 120, 8
    for _ in range(9):
        mid = (lo + hi) // 2
        f = ImageFont.truetype(str(font_path), mid)
        b = f.getbbox("A", anchor="ls")
        bh = b[3] - b[1]
        if bh <= height:
            best, lo = mid, mid + 1
        else:
            hi = mid - 1
    return ImageFont.truetype(str(font_path), max(8, best))


def pick_color(rng: random.Random, bg_patch: np.ndarray, dark_bg: bool,
               low_contrast: bool) -> tuple[tuple[int, int, int], int]:
    """Return (rgb, alpha) with a guaranteed luminance delta >= 22."""
    mean_bg = bg_patch.reshape(-1, 3).mean(axis=0).astype(np.float32)
    lb = lum(mean_bg)
    alpha = int(255 * (rng.uniform(0.68, 0.86) if low_contrast else rng.uniform(0.85, 1.0)))
    a = alpha / 255.0
    want = rng.randint(22, 46) if low_contrast else rng.randint(80, 200)
    toward_white = lb < 128 or (dark_bg and rng.random() < 0.85)
    for attempt in range(12):
        if toward_white:
            base = np.array([rng.randint(200, 255), rng.randint(195, 255), rng.randint(185, 255)], np.float32)
        else:
            base = np.array([rng.randint(0, 55), rng.randint(0, 55), rng.randint(0, 65)], np.float32)
        comp = a * base + (1 - a) * mean_bg
        delta = abs(lum(comp) - lb)
        if delta >= 22:
            return tuple(int(v) for v in base), alpha
        # Push the colour further away from the background.
        if lb >= 128:
            base = np.clip(base - (30 + attempt * 12), 0, 255)
        else:
            base = np.clip(base + (30 + attempt * 12), 0, 255)
        toward_white = lum(base) > lb
    fallback = (255, 255, 255) if lb < 128 else (0, 0, 0)
    return fallback, 255


def normalize_like_frontend(img: np.ndarray, rng: random.Random) -> np.ndarray:
    """Luminance + soft CLAHE + percentile stretch, matching preprocess.ts."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clip = rng.uniform(1.4, 2.6)
    clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8))
    g = clahe.apply(g)
    p2, p98 = np.percentile(g, (2, 98))
    if p98 - p2 < 5:
        p2, p98 = float(g.min()), float(max(int(g.max()), int(g.min()) + 5))
    g = np.clip((g.astype(np.float32) - p2) / (p98 - p2) * 255.0, 0, 255)
    return cv2.cvtColor(g.astype(np.uint8), cv2.COLOR_GRAY2BGR)


@dataclass
class CharBox:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def cls(self) -> int:
        return PERIOD_IDX if self.text == "." else CLASS_TO_IDX[self.text]


def render_scene(rng: random.Random, w: int, h: int, font_path: Path,
                 real_files: list[str], balanced: str | None):
    bg, dark_bg = make_background(rng, h, w, real_files)
    if rng.random() < 0.5:
        draw_ui_distractors(bg, rng)
    img = Image.fromarray(cv2.cvtColor(bg, cv2.COLOR_BGR2RGB)).convert("RGBA")

    margin_x = int(w * rng.uniform(0.035, 0.08))
    margin_y = int(h * rng.uniform(0.05, 0.10))
    avail_w, avail_h = w - 2 * margin_x, h - 2 * margin_y

    n_lines = 1 if rng.random() < 0.62 else 2
    small = rng.random() < 0.30
    if small:
        target_h = rng.randint(14, 22)
    else:
        target_h = rng.randint(24, 48)
    gap = rng.uniform(1.45, 1.9)
    if n_lines * target_h * gap > avail_h:
        n_lines = 1
        target_h = min(target_h, int(avail_h / gap))
        target_h = max(14, target_h)

    text_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(text_layer)
    boxes: list[CharBox] = []

    total_h = n_lines * target_h * gap
    y = margin_y + max(0, (avail_h - total_h) / 2)
    for li in range(n_lines):
        line = choose_line(rng, balanced if li == 0 else None)
        if not line.strip():
            continue
        # Never shrink a glyph below the requested height: trim the string
        # instead, so the detector always sees readable 14-22 / 24-48 px chars.
        size_h = target_h
        fnt = font_for_height(size_h, font_path)
        tracking = rng.uniform(-0.3, 1.0) * (size_h / 40.0)
        adv = [fnt.getlength(ch) for ch in line]
        while len(line) > 2 and sum(adv) + (len(line) - 1) * tracking > avail_w:
            line = line[:-1]
            adv = adv[:-1]
        width = sum(adv) + max(0, len(line) - 1) * tracking
        x = margin_x + (avail_w - width) / 2 if rng.random() < 0.4 else margin_x + rng.uniform(0, max(0.0, avail_w - width))

        # Local background under this line -> colour with guaranteed contrast.
        baseline = y + size_h * 0.85
        patch = bg[max(0, int(y) - 4):min(h, int(y + size_h * 1.3)),
                   max(0, int(x) - 4):min(w, int(x + max(width, 8)))]
        if patch.size == 0:
            patch = bg
        low_contrast = rng.random() < 0.35
        color, alpha = pick_color(rng, patch, dark_bg, low_contrast)
        stroke_w = 1 if (not low_contrast and rng.random() < 0.25) else 0
        fill = (*color, alpha)

        pen = x
        for ch, a in zip(line, adv):
            if ch == " ":
                pen += a + tracking
                continue
            b = fnt.getbbox(ch, anchor="ls")
            tdraw.text((pen, baseline), ch, font=fnt, fill=fill, anchor="ls",
                       stroke_width=stroke_w, stroke_fill=fill)
            x0 = pen + b[0] - stroke_w
            y0 = baseline + b[1] - stroke_w
            x1 = pen + b[2] + stroke_w
            y1 = baseline + b[3] + stroke_w
            if x1 - x0 >= 2 and y1 - y0 >= 2:
                boxes.append(CharBox(ch, x0, y0, x1, y1))
            pen += a + tracking
        y += size_h * gap

    if not boxes:
        return None

    # Soft bloom, then the text itself.
    if rng.random() < 0.45:
        glow = text_layer.filter(ImageFilter.GaussianBlur(rng.uniform(2.0, 5.0)))
        img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, text_layer)
    scene = cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)

    # Geometry: tiny rotation, tiny perspective. No extreme warps.
    angle = 0.0 if rng.random() < 0.5 else rng.uniform(-4.0, 4.0)
    jitter = rng.uniform(0.0, 0.015)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([
        [w * rng.uniform(0, jitter), h * rng.uniform(0, jitter)],
        [w * (1 - rng.uniform(0, jitter)), h * rng.uniform(0, jitter)],
        [w * (1 - rng.uniform(0, jitter)), h * (1 - rng.uniform(0, jitter))],
        [w * rng.uniform(0, jitter), h * (1 - rng.uniform(0, jitter))],
    ])
    persp = cv2.getPerspectiveTransform(src, dst).astype(np.float64)
    rot = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0).astype(np.float64)
    H = np.vstack([rot, [0, 0, 1]]) @ persp
    warped = cv2.warpPerspective(scene, H, (w, h), flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_REPLICATE)

    out_boxes = []
    for b in boxes:
        pts = np.float32([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]).reshape(-1, 1, 2)
        tp = cv2.perspectiveTransform(pts, H).reshape(-1, 2)
        x0, y0 = max(0.0, tp[:, 0].min()), max(0.0, tp[:, 1].min())
        x1, y1 = min(w - 1.0, tp[:, 0].max()), min(h - 1.0, tp[:, 1].max())
        if x1 - x0 < 3 or y1 - y0 < 3:
            continue
        out_boxes.append((b.cls, x0, y0, x1, y1))
    if not out_boxes:
        return None

    # Gentle photometric variation only (sigma <= 0.7).
    if rng.random() < 0.4:
        warped = cv2.GaussianBlur(warped, (3, 3), rng.uniform(0.2, 0.7))
    if rng.random() < 0.3:
        warped = cv2.convertScaleAbs(warped, alpha=rng.uniform(0.92, 1.08), beta=rng.randint(-8, 8))
    if rng.random() < 0.25:
        noise = np.random.default_rng(rng.randrange(1 << 30)).normal(0, rng.uniform(1.5, 4.0), warped.shape)
        warped = np.clip(warped.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    # Train part of the data in the same domain the browser feeds the model.
    if rng.random() < 0.6:
        warped = normalize_like_frontend(warped, rng)

    return warped, out_boxes


def to_yolo(boxes, w: int, h: int) -> str:
    lines = []
    for cls, x0, y0, x1, y1 in boxes:
        cx, cy = (x0 + x1) / 2 / w, (y0 + y1) / 2 / h
        bw, bh = (x1 - x0) / w, (y1 - y0) / h
        lines.append(f"{cls} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
    return "\n".join(lines)


def generate_one(args) -> tuple[str, dict]:
    idx, out_dir, split, seed, size, real_files = args
    rng = random.Random(seed)
    stem = f"{split}_{idx:05d}"
    res = render_scene(rng, size[0], size[1], FONT_PATH, real_files,
                       balanced_lines(1, seed + 7_000_001)[0])
    if res is None:
        rng = random.Random(seed + 999_999)
        res = render_scene(rng, size[0], size[1], FONT_PATH, real_files, None)
    img_dir = Path(out_dir) / "images" / split
    lbl_dir = Path(out_dir) / "labels" / split
    if res is None:
        bg, _ = make_background(rng, size[1], size[0], real_files)
        cv2.imwrite(str(img_dir / f"{stem}.jpg"), bg, [cv2.IMWRITE_JPEG_QUALITY, 92])
        (lbl_dir / f"{stem}.txt").write_text("")
        return stem, {"boxes": 0, "counts": {}}

    img, boxes = res
    cv2.imwrite(str(img_dir / f"{stem}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(82, 95)])
    (lbl_dir / f"{stem}.txt").write_text(to_yolo(boxes, size[0], size[1]))
    counts: dict[int, int] = {}
    for b in boxes:
        counts[b[0]] = counts.get(b[0], 0) + 1
    return stem, {"boxes": len(boxes), "counts": counts}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=str(ROOT / "training" / "dataset"))
    ap.add_argument("--train", type=int, default=3500)
    ap.add_argument("--val", type=int, default=400)
    ap.add_argument("--seed", type=int, default=20261113)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--preview", type=int, default=0)
    ap.add_argument("--profile", choices=["micro", "std"], default="micro")
    ap.add_argument("--bg-dir", default=str(ROOT / "Ejemplos" / "Livestream"))
    args = ap.parse_args()

    out = Path(args.out)
    for split in ("train", "val"):
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)

    real_files = list_real_backgrounds(Path(args.bg_dir))
    sizes = [(192, 192)] if args.profile == "micro" else [(640, 640), (768, 512), (512, 768), (640, 384)]

    jobs = []
    for i in range(args.train):
        jobs.append((i, str(out), "train", args.seed + i * 1009, sizes[(i * 7) % len(sizes)], real_files))
    for i in range(args.val):
        jobs.append((i, str(out), "val", args.seed + 500_000 + i * 1013, sizes[(i * 5) % len(sizes)], real_files))
    if args.preview:
        jobs = jobs[: args.preview]

    stats = {"images": 0, "boxes": 0, "empty": 0}
    class_counts = {i: 0 for i in range(len(CLASSES))}
    from multiprocessing import Pool

    with Pool(args.workers) as pool:
        for n, (stem, info) in enumerate(pool.imap_unordered(generate_one, jobs), 1):
            stats["images"] += 1
            stats["boxes"] += info.get("boxes", 0)
            if info.get("boxes", 0) == 0:
                stats["empty"] += 1
            for k, v in info.get("counts", {}).items():
                class_counts[k] += v
            if n % 200 == 0 or n == len(jobs):
                print(f"[dataset] {n}/{len(jobs)} images, {stats['boxes']} boxes", flush=True)

    (out / "data.yaml").write_text(
        f"path: {out.resolve()}\ntrain: images/train\nval: images/val\nnames:\n"
        + "\n".join(f"  {i}: {name!r}" for i, name in enumerate(CLASSES)) + "\n"
    )
    counts_list = [class_counts[i] for i in range(len(CLASSES))]
    meta = {
        "classes": CLASSES,
        "period_class": "A",
        "images": stats["images"],
        "boxes": stats["boxes"],
        "empty": stats["empty"],
        "class_counts": {CLASSES[i]: counts_list[i] for i in range(len(CLASSES))},
        "class_min": min(counts_list),
        "class_max": max(counts_list),
        "missing_classes": [CLASSES[i] for i in range(len(CLASSES)) if counts_list[i] == 0],
        "seed": args.seed,
        "profile": args.profile,
    }
    (out / "dataset_meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps({k: v for k, v in meta.items() if k not in ("classes", "class_counts")}, indent=2))


if __name__ == "__main__":
    main()

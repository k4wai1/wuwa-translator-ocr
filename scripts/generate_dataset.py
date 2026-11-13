#!/usr/bin/env python3
"""Synthetic dataset generator for the Solaris-3 Script character detector.

Renders English/UI/lore strings with the official font on procedurally generated
backgrounds (low contrast, gradients, perspective, blur, noise, glow) and emits
YOLO-format bounding boxes, one box per character.

Character classes (45):
  A-Z (26), 0-9 (10), ( ) , - / : ; [ ] (9)
The period '.' is intentionally merged into class 'A' because the font uses the
exact same outline for 'A', 'a' and '.'.
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

# Order matters: it is the class index used by the ONNX model and the web app.
PUNCT = ["(", ")", ",", "-", "/", ":", ";", "[", "]"]
CLASSES = [chr(c) for c in range(ord("A"), ord("Z") + 1)] + [str(d) for d in range(10)] + PUNCT
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}
ALLOWED = set(CLASSES) | {" ", "."}
PERIOD_IDX = CLASS_TO_IDX["A"]


def sanitize(text: str) -> str:
    """Keep only characters supported by the font; lowercase -> uppercase."""
    out = []
    for ch in text.upper():
        if ch in ALLOWED:
            out.append(ch)
        elif ch in "!?":
            out.append(".")
        else:
            out.append(" ")
    return " ".join("".join(out).split())


CORPUS = [
    # UI / menus
    "RESONATOR", "SONATA EFFECT", "TUNE BREAK", "ECHO", "ENERGY", "CRIT RATE",
    "CRIT DMG", "WUTHERING WAVES", "JINZHOU", "HUANGDU", "BLACK SHORES",
    "RINASCITA", "SOLARIS-3", "OPEN MAP", "QUEST", "INVENTORY", "CHARACTER",
    "WEAPON", "TEAM", "SETTINGS", "CONFIRM", "CANCEL", "CLAIM", "REWARDS",
    "LEVEL UP", "ASCENSION", "FORTE", "OUTRO SKILL", "RESONANCE LIBERATION",
    "BASIC ATTACK", "HEAVY ATTACK", "DODGE", "PARRY", "TACTICAL HOVER",
    "DATA BANK", "TROPHIES", "ACHIEVEMENTS", "MAIL", "FRIENDS", "GUILD",
    "SHOP", "PURCHASE", "LIMITED", "EVENT", "LOGIN REWARDS", "DAILY",
    "STAMINA", "WAVEPLATES", "ASTRITE", "LUNITE", "SHELL CREDIT",
    # Signs / world
    "CAFE TEA", "WELCOME", "NO ENTRY", "DANGER", "KEEP OUT", "INN",
    "TAVERN", "BLACKSMITH", "MARKET", "NOTICE", "HECATE", "THE LOWDOWN",
    "BOUGH OF LEGIONS", "STAR GLADIATOR", "LUPAS TEAM", "ORIGINALLY NOT ENGLISH",
    "CAESAR CIPHER", "FOUR RIGHT SHIFTS", "UNICASE", "TACET", "FUD",
    "PHARMACY", "BAKERY", "HOTEL", "PARKING", "LIBRARY", "MUSEUM",
    "TRAIN STATION", "BUS STOP", "NORTH GATE", "OLD TOWN", "NEW CITY",
    "RESONANCE BEACON", "SONORO SPHERE", "TIDAL HERITAGE", "DREAMSCAPE",
    # Numbers / stats
    "LV 90", "HP 25000", "ATK 1200", "DEF 800", "COST 4", "RANK S",
    "12:45", "3/4", "A-01", "B-12", "X/Y", "50 60 70", "2026",
    "CRIT 72 5", "ENERGY 120", "TIDE 3", "CHAPTER 2", "ACT 5",
    # Punctuation drills
    "(SOLARIS-3)", "[LORE]", "A, B; C", "1:23", "(A) [B]",
    "X/Y", "A-B-C", "1/2/3", "[ALPHA]", "(BETA)", "GAMMA; DELTA",
    "ITEM 01: ECHO", "COST: 4", "RANK; S", "A.B", "N/A", "24/7",
    "[QUEST]", "[ITEM]", "[ECHO]", "[TEAM]", "(SOLO)", "(CO OP)",
    "[A] [B] [C]", "(1) (2) (3)", "[X]: 12", "(Y): 34", "[Z-9]",
    "A [B] C", "D (E) F", "G; H; I", "J, K, L", "M/N/O", "P-Q-R",
    # Lore snippets
    "THE WINDS REMEMBER", "ALL THAT GLITTERS", "BEYOND THE TIDE",
    "ECHOES OF THE PAST", "A SONG OF SALT AND STONE", "THE LAST SENTINEL",
    "WHERE LIGHT DOES NOT REACH", "GUARDIAN OF THE SHORE",
    "MEMORY OF A FALLEN STAR", "THE SEA KEEPS ITS SECRETS",
    "WHEN THE BELLS RING", "UNDER A PALE MOON", "THE ROAD HOME",
    "TO THE ENDS OF THE EARTH", "NOT ALL WHO WANDER ARE LOST",
    "A PROMISE IN THE DARK", "THE NIGHT IS LONG", "HOLD THE LINE",
    "RISE AND SHINE", "NO TIME TO REST", "KEEP MOVING FORWARD",
    # Random-looking demo strings seen in livestreams
    "ARAN LUMEN", "KALOS TIDE", "VERAN SHORE", "MIRA DUSK",
    "SEVEN SEALS", "SILENT PEAK", "GOLDEN HOUR", "CRIMSON MOON",
    "AZURE DEPTHS", "FROSTBOUND", "EMBERFALL", "STARFALL",
]

GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()-,/:;[]"


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


PALETTES = [
    # (bg_dark, bg_light, accent)
    ((11, 13, 18), (34, 38, 48), (212, 177, 112)),
    ((18, 22, 30), (52, 58, 72), (77, 238, 234)),
    ((24, 18, 14), (60, 46, 32), (232, 196, 140)),
    ((12, 26, 28), (34, 62, 64), (120, 230, 210)),
    ((28, 22, 38), (70, 56, 88), (210, 160, 230)),
    ((40, 32, 20), (235, 226, 205), (120, 84, 40)),
    ((245, 242, 232), (255, 252, 244), (150, 115, 60)),
    ((225, 228, 232), (250, 250, 252), (40, 52, 70)),
]


def rand_color(rng: random.Random, dark: bool) -> tuple[int, int, int]:
    if dark:
        return (rng.randint(8, 60), rng.randint(8, 60), rng.randint(10, 70))
    return (rng.randint(190, 250), rng.randint(190, 250), rng.randint(185, 248))


def gradient_bg(h: int, w: int, c0, c1, angle: float) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    ca, sa = math.cos(angle), math.sin(angle)
    t = (xx * ca + yy * sa)
    t = (t - t.min()) / max(1e-6, (t.max() - t.min()))
    out = np.zeros((h, w, 3), np.float32)
    for k in range(3):
        out[..., k] = c0[k] + (c1[k] - c0[k]) * t
    return out


def make_background(rng: random.Random, h: int, w: int) -> tuple[np.ndarray, tuple[int, int, int], bool]:
    """Return background, its mean colour and whether it is dark."""
    scheme = rng.randrange(4)
    pal = PALETTES[rng.randrange(len(PALETTES))]
    dark = scheme in (0, 1, 2)
    c0 = np.array(pal[0] if dark else pal[1], np.float32)
    c1 = np.array(pal[1] if dark else pal[0], np.float32)

    if scheme == 0:  # soft gradient
        bg = gradient_bg(h, w, c0, c1, rng.uniform(0, math.tau))
    elif scheme == 1:  # noisy stone / cloth
        small = np.array(
            [[[rng.gauss(128, 24) for _ in range(3)] for _ in range(w // 8 + 1)] for _ in range(h // 8 + 1)],
            np.float32,
        )
        bg = cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)
        bg = cv2.GaussianBlur(bg, (0, 0), 2.0)
        bg = bg / 255.0 * (c1 - c0) + c0
    elif scheme == 2:  # UI panels
        bg = gradient_bg(h, w, c0, c0 * 0.75 + 4, rng.uniform(0, math.tau))
        overlay = np.zeros_like(bg)
        for _ in range(rng.randint(3, 7)):
            x0, y0 = rng.randint(-w // 6, w), rng.randint(-h // 6, h)
            pw, ph = rng.randint(w // 8, w // 2), rng.randint(h // 10, h // 2)
            col = np.array([rng.randint(10, 240) for _ in range(3)], np.float32)
            cv2.rectangle(overlay, (x0, y0), (x0 + pw, y0 + ph), col.tolist(), -1)
        overlay = cv2.GaussianBlur(overlay, (0, 0), rng.uniform(8, 28))
        bg = bg * 0.8 + overlay * rng.uniform(0.08, 0.25)
    else:  # bright parchment photo
        bg = gradient_bg(h, w, c0, c1, rng.uniform(0, math.tau))
        bg += np.random.default_rng(rng.randrange(1 << 30)).normal(0, 6, bg.shape)
        bg = cv2.GaussianBlur(bg, (0, 0), 0.8)

    bg = np.clip(bg, 0, 255).astype(np.uint8)
    mean = tuple(int(v) for v in np.mean(bg, axis=(0, 1)))
    lum = 0.299 * mean[0] + 0.587 * mean[1] + 0.114 * mean[2]
    return bg, mean, lum < 128


def pick_text_color(rng: random.Random, bg_mean, dark_bg: bool, low_contrast: bool):
    bg = np.array(bg_mean, np.float32)
    if low_contrast:
        delta = rng.randint(16, 48)
        if dark_bg:
            col = np.clip(bg + delta, 0, 255)
        else:
            col = np.clip(bg - delta, 0, 255)
        # occasional hue shift while keeping luminance close
        if rng.random() < 0.5:
            col = np.clip(col + np.array([rng.randint(-18, 18) for _ in range(3)]), 0, 255)
    else:
        if dark_bg:
            col = np.array([rng.randint(170, 255), rng.randint(160, 255), rng.randint(140, 255)], np.float32)
        else:
            col = np.array([rng.randint(10, 80), rng.randint(10, 80), rng.randint(10, 90)], np.float32)
    return tuple(int(v) for v in col)


def choose_line(rng: random.Random) -> str:
    r = rng.random()
    if r < 0.5:
        text = rng.choice(CORPUS)
    elif r < 0.68:
        text = "".join(rng.choice(GLYPHS.replace(" ", "")) for _ in range(rng.randint(3, 12)))
    elif r < 0.82:
        # random word-ish chunks with digits
        words = []
        for _ in range(rng.randint(1, 4)):
            words.append("".join(rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(rng.randint(2, 7))))
        text = " ".join(words)
    elif r < 0.92:
        text = f"{rng.choice('ABCDXY')}{rng.choice('-/:;,.')}{rng.randint(0, 99):02d}"
    else:
        text = "".join(rng.choice("0123456789") for _ in range(rng.randint(2, 6)))
    return sanitize(text)


def render_scene(rng: random.Random, w: int, h: int, font_path: Path):
    bg, bg_mean, dark_bg = make_background(rng, h, w)
    img = Image.fromarray(cv2.cvtColor(bg, cv2.COLOR_BGR2RGB)).convert("RGBA")

    margin_x = int(w * rng.uniform(0.08, 0.16))
    margin_y = int(h * rng.uniform(0.10, 0.20))
    avail_w = w - 2 * margin_x
    avail_h = h - 2 * margin_y

    n_lines = rng.choices([1, 2, 3], weights=[0.25, 0.45, 0.30])[0]
    low_contrast = rng.random() < 0.45
    size = int(min(h, w) * rng.uniform(0.055, 0.105))
    size = max(28, min(size, 84))
    line_gap = rng.uniform(1.35, 1.9)
    total_h = n_lines * size * line_gap
    if total_h > avail_h:
        size = max(18, int(avail_h / (n_lines * line_gap)))
        total_h = n_lines * size * line_gap

    try:
        font = ImageFont.truetype(str(font_path), size)
    except OSError as exc:  # pragma: no cover
        raise SystemExit(f"Cannot load {font_path}: {exc}")

    text_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(text_layer)
    boxes: list[CharBox] = []

    y = margin_y + (avail_h - total_h) / 2
    for li in range(n_lines):
        line = choose_line(rng)
        if not line.strip():
            continue
        # Prefer a line that fits at full size; fall back to gentle shrinking.
        best = None
        for _ in range(6):
            adv_try = [font.getlength(ch) for ch in line]
            w_try = sum(adv_try)
            if best is None or w_try < best[1]:
                best = (line, w_try, adv_try)
            if w_try <= avail_w:
                best = (line, w_try, adv_try)
                break
            line = choose_line(rng)
        line, line_w, adv = best
        scale = 1.0
        if line_w > avail_w:
            scale = avail_w / line_w
        tracking = rng.uniform(-0.5, 1.5) * (size / 40.0)
        render_w = sum(a * scale for a in adv) + max(0, len(line) - 1) * tracking
        if rng.random() < 0.35:
            x = margin_x + (avail_w - render_w) / 2
        else:
            x = margin_x + rng.uniform(0, max(0, avail_w - render_w))
        baseline = y + size * 0.82
        color = pick_text_color(rng, bg_mean, dark_bg, low_contrast)
        alpha = int(255 * (rng.uniform(0.35, 0.8) if low_contrast else rng.uniform(0.75, 1.0)))
        fill = (*color, alpha)
        stroke_w = 0
        stroke_fill = None
        if not low_contrast and rng.random() < 0.25:
            stroke_w = rng.randint(0, 2)
            stroke_fill = (*color, alpha)

        pen = x
        for ch, a in zip(line, adv):
            step = a * scale
            if ch == " ":
                pen += step + tracking
                continue
            b = font.getbbox(ch, anchor="ls")
            # getbbox with 'ls' anchor: (x0, y0, x1, y1) relative to baseline origin
            draw_size = max(1, int(round(size * scale)))
            if draw_size != size:
                fnt = ImageFont.truetype(str(font_path), draw_size)
            else:
                fnt = font
            b = fnt.getbbox(ch, anchor="ls")
            tdraw.text(
                (pen, baseline), ch, font=fnt, fill=fill, anchor="ls",
                stroke_width=stroke_w, stroke_fill=stroke_fill,
            )
            x0, y0 = pen + b[0], baseline + b[1]
            x1, y1 = pen + b[2], baseline + b[3]
            if x1 - x0 >= 2 and y1 - y0 >= 2:
                boxes.append(CharBox(ch, x0, y0, x1, y1))
            pen += step + tracking
        y += size * line_gap

    if not boxes:
        return None

    # Glow / bloom, especially for low-contrast neon scenes.
    if rng.random() < 0.55:
        glow = text_layer.filter(ImageFilter.GaussianBlur(rng.uniform(2, 7)))
        glow_col = np.array(glow)
        tint = np.array(pick_text_color(rng, bg_mean, dark_bg, False), np.float32)
        glow_col[..., :3] = (glow_col[..., :3].astype(np.float32) * 0.35 + tint * 0.65).astype(np.uint8)
        glow = Image.fromarray(glow_col)
        img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, text_layer)

    # Occasional UI overlay streaks / particles (soft occlusion).
    if rng.random() < 0.18:
        ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        od = ImageDraw.Draw(ov)
        for _ in range(rng.randint(2, 6)):
            cx, cy = rng.randint(0, w), rng.randint(0, h)
            r = rng.randint(3, max(4, w // 14))
            c = rng.choice([(255, 255, 255, 40), (220, 220, 255, 30), (212, 177, 112, 45)])
            od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
        ov = ov.filter(ImageFilter.GaussianBlur(rng.uniform(1, 5)))
        img = Image.alpha_composite(img, ov)

    scene = cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)

    # Global geometric transform: rotation + perspective + gentle scale.
    angle = rng.uniform(-25, 25)
    if rng.random() < 0.7:
        angle = rng.uniform(-13, 13)
    jitter = rng.uniform(0.0, 0.06)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([
        [w * rng.uniform(0, jitter), h * rng.uniform(0, jitter)],
        [w * (1 - rng.uniform(0, jitter)), h * rng.uniform(0, jitter)],
        [w * (1 - rng.uniform(0, jitter)), h * (1 - rng.uniform(0, jitter))],
        [w * rng.uniform(0, jitter), h * (1 - rng.uniform(0, jitter))],
    ])
    persp = cv2.getPerspectiveTransform(src, dst)
    rot = cv2.getRotationMatrix2D((w / 2, h / 2), angle, rng.uniform(0.96, 1.04))
    rot3 = np.vstack([rot, [0, 0, 1]]).astype(np.float64)
    H = rot3 @ persp.astype(np.float64)
    warped = cv2.warpPerspective(scene, H, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    # Boxes: axis-aligned bounds of the four transformed corners.
    out_boxes = []
    for b in boxes:
        pts = np.float32([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]).reshape(-1, 1, 2)
        tp = cv2.perspectiveTransform(pts, H).reshape(-1, 2)
        x0, y0 = tp[:, 0].min(), tp[:, 1].min()
        x1, y1 = tp[:, 0].max(), tp[:, 1].max()
        x0, y0 = max(0.0, x0), max(0.0, y0)
        x1, y1 = min(w - 1.0, x1), min(h - 1.0, y1)
        if x1 - x0 < 3 or y1 - y0 < 3:
            continue
        area = (x1 - x0) * (y1 - y0)
        if area > 0.35 * w * h:
            continue
        out_boxes.append((b.cls, x0, y0, x1, y1))

    if len(out_boxes) < 1:
        return None

    # Photometric degradation.
    if rng.random() < 0.6:
        k = rng.choice([3, 3, 5])
        warped = cv2.GaussianBlur(warped, (k, k), rng.uniform(0, 1.1))
    if rng.random() < 0.35:
        warped = cv2.convertScaleAbs(warped, alpha=rng.uniform(0.85, 1.15), beta=rng.randint(-18, 18))
    if rng.random() < 0.35:
        noise = np.random.default_rng(rng.randrange(1 << 30)).normal(0, rng.uniform(3, 13), warped.shape)
        warped = np.clip(warped.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    if rng.random() < 0.25:  # vignette
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
        vig = np.clip(1.05 - 0.22 * d, 0.55, 1.0)[..., None]
        warped = np.clip(warped.astype(np.float32) * vig, 0, 255).astype(np.uint8)

    # Preprocessing-domain augmentation: teach the detector to survive the
    # browser's grayscale / adaptive-threshold / edge filters.
    r = rng.random()
    if r < 0.16:  # grayscale
        g = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        warped = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
    elif r < 0.26:  # global Otsu threshold (inverted variants too)
        g = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        g = cv2.GaussianBlur(g, (3, 3), 0)
        _, th = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        if rng.random() < 0.5:
            th = 255 - th
        warped = cv2.cvtColor(th, cv2.COLOR_GRAY2BGR)
    elif r < 0.34:  # adaptive threshold
        g = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        block = rng.choice([15, 21, 31])
        th = cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block, rng.uniform(-4, 8))
        if rng.random() < 0.5:
            th = 255 - th
        warped = cv2.cvtColor(th, cv2.COLOR_GRAY2BGR)
    elif r < 0.40:  # edge magnitude (embossed stone look)
        g = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
        mag = cv2.magnitude(gx, gy)
        mag = np.clip(mag * rng.uniform(0.6, 1.4), 0, 255).astype(np.uint8)
        warped = cv2.cvtColor(mag, cv2.COLOR_GRAY2BGR)

    return warped, out_boxes


def to_yolo(boxes, w: int, h: int) -> str:
    lines = []
    for cls, x0, y0, x1, y1 in boxes:
        cx = (x0 + x1) / 2 / w
        cy = (y0 + y1) / 2 / h
        bw = (x1 - x0) / w
        bh = (y1 - y0) / h
        lines.append(f"{cls} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
    return "\n".join(lines)


def generate_one(args) -> tuple[str, dict]:
    idx, out_dir, split, seed, size = args
    rng = random.Random(seed)
    stem = f"{split}_{idx:05d}"
    res = render_scene(rng, size[0], size[1], FONT_PATH)
    img_dir = Path(out_dir) / "images" / split
    lbl_dir = Path(out_dir) / "labels" / split
    if res is None:
        # Retry once with a different seed; fall back to a plain negative.
        rng = random.Random(seed + 999_999)
        res = render_scene(rng, size[0], size[1], FONT_PATH)
    if res is None:
        bg, _, _ = make_background(rng, size[1], size[0])
        cv2.imwrite(str(img_dir / f"{stem}.jpg"), bg, [cv2.IMWRITE_JPEG_QUALITY, 88])
        (lbl_dir / f"{stem}.txt").write_text("")
        return stem, {"boxes": 0}

    img, boxes = res
    quality = rng.randint(70, 95)
    cv2.imwrite(str(img_dir / f"{stem}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    (lbl_dir / f"{stem}.txt").write_text(to_yolo(boxes, size[0], size[1]))
    classes = sorted({b[0] for b in boxes})
    return stem, {"boxes": len(boxes), "classes": classes}


def parse_size(s: str) -> tuple[int, int]:
    w, h = s.lower().split("x")
    return int(w), int(h)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=str(ROOT / "training" / "dataset"))
    ap.add_argument("--train", type=int, default=2400)
    ap.add_argument("--val", type=int, default=400)
    ap.add_argument("--seed", type=int, default=20261113)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--preview", type=int, default=0, help="Generate only N preview images in ./preview")
    args = ap.parse_args()

    out = Path(args.out)
    for split in ("train", "val"):
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)

    sizes = [(640, 640), (768, 512), (512, 768), (896, 512), (640, 384), (704, 704)]

    jobs = []
    for i in range(args.train):
        sizes_pick = sizes[(i * 7 + (args.seed % 6)) % len(sizes)]
        jobs.append((i, str(out), "train", args.seed + i * 1009, sizes_pick))
    for i in range(args.val):
        sizes_pick = sizes[(i * 5 + 3) % len(sizes)]
        jobs.append((i, str(out), "val", args.seed + 500_000 + i * 1013, sizes_pick))

    if args.preview:
        jobs = jobs[: args.preview]

    stats = {"images": 0, "boxes": 0, "classes_seen": set(), "empty": 0}
    from multiprocessing import Pool

    with Pool(args.workers) as pool:
        for n, (stem, info) in enumerate(pool.imap_unordered(generate_one, jobs), 1):
            stats["images"] += 1
            stats["boxes"] += info.get("boxes", 0)
            stats["classes_seen"].update(info.get("classes", []))
            if info.get("boxes", 0) == 0:
                stats["empty"] += 1
            if n % 100 == 0 or n == len(jobs):
                print(f"[dataset] {n}/{len(jobs)} images, {stats['boxes']} boxes", flush=True)

    names = CLASSES
    (out / "data.yaml").write_text(
        "path: .\ntrain: images/train\nval: images/val\nnames:\n"
        + "\n".join(f"  {i}: {name!r}" for i, name in enumerate(names))
        + "\n"
    )
    meta = {
        "classes": names,
        "period_class": "A",
        "images": stats["images"],
        "boxes": stats["boxes"],
        "empty": stats["empty"],
        "classes_seen": sorted(stats["classes_seen"]),
        "missing_classes": [i for i in range(len(names)) if i not in stats["classes_seen"]],
        "seed": args.seed,
    }
    (out / "dataset_meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps({k: v for k, v in meta.items() if k != "classes"}, indent=2))


if __name__ == "__main__":
    main()

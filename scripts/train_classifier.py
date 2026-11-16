#!/usr/bin/env python3
"""Train GlyphNet: a 32x32 second-stage glyph classifier.

Pipeline contract (must match `src/lib/ocr.ts` exactly):
  crop (15% margin) -> RGB->luminance -> resize 32x32 -> per-crop
  percentile stretch p5..p95 to 0..1 -> 3 identical channels -> logits.

Class 45 is the "noise / icon / partial glyph" reject class. Any detection
whose crop lands on 45 is discarded by the browser.
"""
import argparse
import json
import random
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

from chargen import CLASSES, NUM_CLASSES

ROOT = Path(__file__).resolve().parent.parent
S = 32          # network input
LOAD = 40       # resized crop before random crop (train) / centre crop (val)
NOISE = NUM_CLASSES  # 45


def to_gray(crop: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY).astype(np.float32)


def normalize_crop(crop: np.ndarray) -> np.ndarray:
    """Percentile contrast stretch, identical to the TypeScript version."""
    g = to_gray(crop)
    p5, p95 = np.percentile(g, (5, 95))
    denom = max(float(p95 - p5), 10.0)
    g = np.clip((g - p5) / denom, 0.0, 1.0)
    return np.repeat(g[:, :, None], 3, axis=2).astype(np.float32)


def square_crop(img, x0, y0, x1, y1):
    """Expand a box to a square with 15% margin (keeps glyph proportions)."""
    h, w = img.shape[:2]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(x1 - x0, y1 - y0) * 1.15
    side = max(6.0, side)
    x0, x1 = int(cx - side / 2), int(cx + side / 2)
    y0, y1 = int(cy - side / 2), int(cy + side / 2)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w, x1), min(h, y1)
    if x1 - x0 < 3 or y1 - y0 < 3:
        return None
    return img[y0:y1, x0:x1]


def load_crops(root: Path, split: str, neg_per_image: int = 0):
    xs, ys = [], []
    img_dir = root / "images" / split
    lbl_dir = root / "labels" / split
    rng = random.Random(1234)
    for ip in sorted(img_dir.glob("*.jpg")):
        lp = lbl_dir / (ip.stem + ".txt")
        if not lp.exists():
            continue
        img = cv2.imread(str(ip), cv2.IMREAD_COLOR)
        if img is None:
            continue
        h, w = img.shape[:2]
        gts = []
        for line in lp.read_text().splitlines():
            p = line.split()
            if len(p) != 5:
                continue
            c = int(p[0])
            cx, cy, bw, bh = (float(v) for v in p[1:])
            x0, x1 = (cx - bw / 2) * w, (cx + bw / 2) * w
            y0, y1 = (cy - bh / 2) * h, (cy + bh / 2) * h
            gts.append((x0, y0, x1, y1))
            crop = square_crop(img, x0, y0, x1, y1)
            if crop is None:
                continue
            xs.append(cv2.resize(crop, (LOAD, LOAD), interpolation=cv2.INTER_AREA))
            ys.append(c)
            # Half-glyph crops are the classic icon-edge false positive.
            if neg_per_image and rng.random() < 0.5:
                mx = (x1 - x0) * 0.55
                crop2 = square_crop(img, x0 + mx, y0, x1 + mx, y1)
                if crop2 is not None:
                    xs.append(cv2.resize(crop2, (LOAD, LOAD), interpolation=cv2.INTER_AREA))
                    ys.append(NOISE)
        for _ in range(neg_per_image):
            bw = rng.uniform(0.05, 0.11) * w
            bh = rng.uniform(0.06, 0.13) * h
            x0 = rng.uniform(0, max(1.0, w - bw - 1))
            y0 = rng.uniform(0, max(1.0, h - bh - 1))
            x1, y1 = x0 + bw, y0 + bh
            if any(not (x1 < gx0 or x0 > gx1 or y1 < gy0 or y0 > gy1)
                   for gx0, gy0, gx1, gy1 in gts):
                continue
            crop = img[int(y0):int(y1), int(x0):int(x1)]
            if crop.size == 0:
                continue
            xs.append(cv2.resize(crop, (LOAD, LOAD), interpolation=cv2.INTER_AREA))
            ys.append(NOISE)
    return np.stack(xs), np.asarray(ys, np.int64)


class CropDataset(Dataset):
    def __init__(self, xs, ys, train=False):
        self.xs, self.ys, self.train = xs, ys, train

    def __len__(self):
        return len(self.ys)

    def __getitem__(self, i):
        img = self.xs[i]
        if self.train:
            if random.random() < 0.6:
                img = cv2.convertScaleAbs(img, alpha=random.uniform(0.7, 1.35),
                                          beta=random.randint(-25, 25))
            if random.random() < 0.3:
                k = random.choice([3, 3, 5])
                img = cv2.GaussianBlur(img, (k, k), random.uniform(0.2, 1.0))
            if random.random() < 0.5:
                ang = random.uniform(-6, 6)
                M = cv2.getRotationMatrix2D((LOAD / 2, LOAD / 2), ang, 1.0)
                img = cv2.warpAffine(img, M, (LOAD, LOAD), borderMode=cv2.BORDER_REPLICATE)
            dx, dy = random.randint(-3, 3), random.randint(-3, 3)
            M = np.float32([[1, 0, dx], [0, 1, dy]])
            img = cv2.warpAffine(img, M, (LOAD, LOAD), borderMode=cv2.BORDER_REPLICATE)
            x0 = random.randint(0, LOAD - S)
            y0 = random.randint(0, LOAD - S)
        else:
            x0 = y0 = (LOAD - S) // 2
        img = img[y0:y0 + S, x0:x0 + S]
        t = torch.from_numpy(normalize_crop(img).transpose(2, 0, 1).copy())
        return t, int(self.ys[i])


class GlyphNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, 3, 2, 1, bias=False), nn.BatchNorm2d(32), nn.ReLU(True),
            nn.Conv2d(32, 64, 3, 2, 1, bias=False), nn.BatchNorm2d(64), nn.ReLU(True),
            nn.Conv2d(64, 96, 3, 2, 1, bias=False), nn.BatchNorm2d(96), nn.ReLU(True),
            nn.Conv2d(96, 128, 3, 1, 1, bias=False), nn.BatchNorm2d(128), nn.ReLU(True),
        )
        self.fc = nn.Linear(128, NUM_CLASSES + 1)

    def forward(self, x):
        x = self.features(x)
        x = F.adaptive_avg_pool2d(x, 1).flatten(1)
        return self.fc(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / "training" / "micro"))
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=0)
    ap.add_argument("--neg", type=int, default=2, help="Negatives per training image")
    ap.add_argument("--out", default=str(ROOT / "training" / "classifier"))
    args = ap.parse_args()

    torch.manual_seed(0)
    random.seed(0)
    if torch.cuda.is_available():
        torch.set_num_threads(4)
    else:
        torch.set_num_threads(2)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    root = Path(args.data)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    xtr, ytr = load_crops(root, "train", neg_per_image=args.neg)
    xva, yva = load_crops(root, "val", neg_per_image=1)
    if args.limit:
        xtr, ytr = xtr[:args.limit], ytr[:args.limit]
    print(f"[clf] train={len(ytr)} val={len(yva)} device={device}", flush=True)

    pin = device.type == "cuda"
    tr = DataLoader(CropDataset(xtr, ytr, True), batch_size=args.batch, shuffle=True,
                    num_workers=args.workers, pin_memory=pin)
    va = DataLoader(CropDataset(xva, yva, False), batch_size=256, num_workers=args.workers)

    model = GlyphNet().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, args.epochs)
    best = 0.0
    for ep in range(args.epochs):
        model.train()
        tot = cor = 0
        loss_sum = 0.0
        for x, y in tr:
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            logits = model(x)
            loss = F.cross_entropy(logits, y, label_smoothing=0.02)
            opt.zero_grad()
            loss.backward()
            opt.step()
            loss_sum += float(loss.detach())
            tot += len(y)
            cor += int((logits.argmax(1) == y).sum())
        sched.step()
        model.eval()
        vcor = vtot = 0
        with torch.no_grad():
            for x, y in va:
                x, y = x.to(device), y.to(device)
                vcor += int((model(x).argmax(1) == y).sum())
                vtot += len(y)
        acc = vcor / max(1, vtot)
        print(f"[clf] epoch {ep+1}/{args.epochs} loss={loss_sum/max(1,len(tr)):.3f} "
              f"train={cor/tot:.3f} val={acc:.3f}", flush=True)
        if acc > best:
            best = acc
            torch.save({"model": {k: v.cpu() for k, v in model.state_dict().items()},
                        "val_acc": acc, "imgsz": S}, out / "best.pt")
    print(f"[clf] best val acc {best:.4f}")

    ck = torch.load(out / "best.pt", map_location="cpu", weights_only=False)
    model.load_state_dict(ck["model"])
    model.to("cpu").eval()
    dummy = torch.zeros(1, 3, S, S)
    torch.onnx.export(model, dummy, str(out / "classifier.onnx"), input_names=["images"],
                      output_names=["logits"], opset_version=12, dynamo=False,
                      dynamic_axes={"images": {0: "batch"}, "logits": {0: "batch"}})
    (out / "meta.json").write_text(json.dumps({
        "imgsz": S, "numClasses": NUM_CLASSES + 1, "classes": CLASSES,
        "noiseClass": NOISE, "val_acc": best, "normalize": "luma p5..p95 -> 0..1",
    }, indent=2))
    print(f"[clf] exported {out/'classifier.onnx'}")


if __name__ == "__main__":
    main()

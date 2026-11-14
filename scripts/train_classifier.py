#!/usr/bin/env python3
"""Train a small glyph classifier on ground-truth crops.

Used as a second stage after the SolarisCharNet detector: the detector finds
character boxes, then this classifier identifies the glyph. Clean, centered
crops are much easier to classify than the full detection grid, which raises
accuracy on a low-power CPU.
"""
import argparse, json, random
from pathlib import Path
import cv2, numpy as np, torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from chargen import NUM_CLASSES, CLASSES

ROOT = Path(__file__).resolve().parent.parent
S = 32

def load_crops(root, split, size=40, margin=0.12, neg=0):
    xs, ys = [], []
    img_dir = root / "images" / split
    lbl_dir = root / "labels" / split
    for ip in sorted(img_dir.glob("*.jpg")):
        lp = lbl_dir / (ip.stem + ".txt")
        if not lp.exists(): continue
        img = cv2.imread(str(ip), cv2.IMREAD_COLOR)
        h, w = img.shape[:2]
        gts = []
        for line in lp.read_text().splitlines():
            p = line.split()
            if len(p) != 5: continue
            c = int(p[0]); cx, cy, bw, bh = (float(v) for v in p[1:])
            x0 = int((cx - bw/2 - bw*margin) * w); x1 = int((cx + bw/2 + bw*margin) * w)
            y0 = int((cy - bh/2 - bh*margin) * h); y1 = int((cy + bh/2 + bh*margin) * h)
            x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(w, x1), min(h, y1)
            if x1 - x0 < 3 or y1 - y0 < 3: continue
            crop = cv2.resize(img[y0:y1, x0:x1], (size, size), interpolation=cv2.INTER_AREA)
            xs.append(crop); ys.append(c)
            gts.append((x0, y0, x1, y1))
    if neg:
        rng = random.Random(0)
        for ip in sorted(img_dir.glob("*.jpg")):
            img = cv2.imread(str(ip), cv2.IMREAD_COLOR)
            h, w = img.shape[:2]
            lp = lbl_dir / (ip.stem + ".txt")
            if not lp.exists(): continue
            gts = []
            for line in lp.read_text().splitlines():
                q = line.split()
                if len(q) == 5:
                    cx, cy, bw, bh = (float(v) for v in q[1:])
                    gts.append((cx*w, cy*h, bw*w, bh*h))
            for _ in range(neg):
                bw = rng.uniform(0.04, 0.10) * w; bh = rng.uniform(0.05, 0.12) * h
                x0 = rng.randint(0, max(1, int(w - bw - 1))); y0 = rng.randint(0, max(1, int(h - bh - 1)))
                cx, cy = x0 + bw/2, y0 + bh/2
                if any(abs(cx-gx) < (bw+gw)/2 and abs(cy-gy) < (bh+gh)/2 for gx,gy,gw,gh in gts):
                    continue
                crop = cv2.resize(img[y0:y0+int(bh), x0:x0+int(bw)], (size, size), interpolation=cv2.INTER_AREA)
                xs.append(crop); ys.append(45)
    return np.stack(xs), np.asarray(ys, np.int64)

class CropDataset(Dataset):
    def __init__(self, xs, ys, train=False):
        self.xs, self.ys, self.train = xs, ys, train
    def __len__(self): return len(self.ys)
    def __getitem__(self, i):
        img = self.xs[i]
        if self.train:
            if random.random() < 0.5:
                img = cv2.convertScaleAbs(img, alpha=random.uniform(0.75, 1.3),
                                          beta=random.randint(-25, 25))
            dx, dy = random.randint(-3, 3), random.randint(-3, 3)
            M = np.float32([[1, 0, dx], [0, 1, dy]])
            img = cv2.warpAffine(img, M, (40, 40), borderMode=cv2.BORDER_REPLICATE)
        else:
            img = cv2.resize(img, (40, 40), interpolation=cv2.INTER_AREA)
        if self.train:
            x0 = random.randint(0, 40 - S); y0 = random.randint(0, 40 - S)
            img = img[y0:y0+S, x0:x0+S]
        img = cv2.resize(img, (S, S), interpolation=cv2.INTER_AREA)
        t = torch.from_numpy(img.astype(np.float32).transpose(2,0,1) / 255.0)
        return t, int(self.ys[i])

class GlyphNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, 3, 2, 1, bias=False), nn.BatchNorm2d(32), nn.ReLU(True),
            nn.Conv2d(32, 64, 3, 2, 1, bias=False), nn.BatchNorm2d(64), nn.ReLU(True),
            nn.Conv2d(64, 96, 3, 2, 1, bias=False), nn.BatchNorm2d(96), nn.ReLU(True),
        )
        self.fc = nn.Linear(96, NUM_CLASSES + 1)
    def forward(self, x):
        x = self.features(x)
        x = F.adaptive_avg_pool2d(x, 1).flatten(1)
        return self.fc(x)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / "training" / "micro"))
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default=str(ROOT / "training" / "classifier"))
    args = ap.parse_args()
    torch.manual_seed(0); random.seed(0)
    torch.set_num_threads(2)
    root = Path(args.data); out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    xtr, ytr = load_crops(root, "train", neg=2); xva, yva = load_crops(root, "val")
    if args.limit: xtr, ytr = xtr[:args.limit], ytr[:args.limit]
    print(f"[clf] train={len(ytr)} val={len(yva)}")
    tr = DataLoader(CropDataset(xtr, ytr, True), batch_size=args.batch, shuffle=True, num_workers=0)
    va = DataLoader(CropDataset(xva, yva, False), batch_size=256, num_workers=0)

    model = GlyphNet(); opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, args.epochs)
    best = 0.0
    for ep in range(args.epochs):
        model.train(); tot = cor = 0; loss_sum = 0.0
        for x, y in tr:
            logits = model(x); loss = F.cross_entropy(logits, y)
            opt.zero_grad(); loss.backward(); opt.step()
            loss_sum += float(loss); tot += len(y); cor += int((logits.argmax(1) == y).sum())
        sched.step()
        model.eval(); vcor = vtot = 0
        with torch.no_grad():
            for x, y in va:
                vcor += int((model(x).argmax(1) == y).sum()); vtot += len(y)
        acc = vcor / max(1, vtot)
        print(f"[clf] epoch {ep+1}/{args.epochs} loss={loss_sum/max(1,len(tr)):.3f} train={cor/tot:.3f} val={acc:.3f}", flush=True)
        if acc > best:
            best = acc
            torch.save({"model": model.state_dict(), "val_acc": acc}, out / "best.pt")
    print(f"[clf] best val acc {best:.4f}")

    model.eval()
    dummy = torch.zeros(1, 3, S, S)
    torch.onnx.export(model, dummy, str(out / "classifier.onnx"), input_names=["images"],
                      output_names=["logits"], opset_version=12, dynamo=False,
                      dynamic_axes={"images": {0: "batch"}, "logits": {0: "batch"}})
    (out / "meta.json").write_text(json.dumps({"imgsz": S, "numClasses": NUM_CLASSES + 1,
        "classes": CLASSES, "val_acc": best}, indent=2))
    print(f"[clf] exported {out/'classifier.onnx'}")

if __name__ == "__main__":
    main()

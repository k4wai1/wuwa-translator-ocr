"""Shared PyTorch model, dataset and decoding helpers for the lightweight
Solaris character detector (SolarisCharNet).

The model is an anchor-free CenterNet-style detector:
  input  : 1x3xSxS  (S = 160 by default)
  stride : 4
  output : 1 x (1 + 45 + 4) x S/4 x S/4
           [ objectness logit | 45 class logits | dx, dy, log(w), log(h) ]

It was chosen over YOLOv8n because the training machine is a 2-core Celeron
without AVX: YOLOv8n needs ~12 s per batch at 320 px, while this network trains
roughly 10x faster and still produces per-character boxes.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset

CLASSES = [chr(c) for c in range(ord("A"), ord("Z") + 1)] + [str(d) for d in range(10)] + [
    "(", ")", ",", "-", "/", ":", ";", "[", "]"
]
NUM_CLASSES = len(CLASSES)
STRIDE = 4

ROOT = Path(__file__).resolve().parent.parent


class DSConv(nn.Module):
    """Depthwise-separable convolution block."""

    def __init__(self, in_ch: int, out_ch: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, 1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.SiLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1, groups=out_ch, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.SiLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 1, bias=False),
            nn.BatchNorm2d(out_ch),
            nn.SiLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class SolarisCharNet(nn.Module):
    """Small dense CNN detector (stride 4). Dense convs are dramatically faster
    than depthwise-separable blocks on AVX-less CPUs."""

    def __init__(self, num_classes: int = NUM_CLASSES, width: int = 48):
        super().__init__()
        c1 = max(8, width // 3)
        c2 = max(16, (width * 2) // 3)
        c3 = width
        self.stem = nn.Sequential(
            nn.Conv2d(3, c1, 3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(c1),
            nn.ReLU(inplace=True),
            nn.Conv2d(c1, c2, 3, stride=2, padding=1, bias=False),
            nn.BatchNorm2d(c2),
            nn.ReLU(inplace=True),
            nn.Conv2d(c2, c3, 3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(c3),
            nn.ReLU(inplace=True),
        )
        self.out = nn.Conv2d(c3, 1 + num_classes + 4, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.out(self.stem(x))


def load_image(path: Path, imgsz: int) -> torch.Tensor:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(path)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    if img.shape[0] != imgsz or img.shape[1] != imgsz:
        img = cv2.resize(img, (imgsz, imgsz), interpolation=cv2.INTER_AREA)
    arr = img.astype(np.float32) / 255.0
    return torch.from_numpy(arr).permute(2, 0, 1).contiguous()


class CharDataset(Dataset):
    def __init__(self, root: Path, split: str, imgsz: int):
        self.root = root
        self.split = split
        self.imgsz = imgsz
        self.items: list[tuple[Path, Path]] = []
        img_dir = root / "images" / split
        lbl_dir = root / "labels" / split
        for img in sorted(img_dir.glob("*.jpg")):
            lbl = lbl_dir / (img.stem + ".txt")
            if lbl.exists():
                self.items.append((img, lbl))

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, idx: int):
        img_path, lbl_path = self.items[idx]
        img = load_image(img_path, self.imgsz)
        boxes = []
        for line in lbl_path.read_text().strip().splitlines():
            parts = line.split()
            if len(parts) != 5:
                continue
            cls = int(parts[0])
            cx, cy, w, h = (float(v) for v in parts[1:])
            boxes.append([cls, cx, cy, w, h])
        return img, torch.tensor(boxes, dtype=torch.float32).reshape(-1, 5)


def collate(batch):
    imgs = torch.stack([b[0] for b in batch], dim=0)
    boxes = [b[1] for b in batch]
    return imgs, boxes


def build_targets(
    boxes_batch: list[torch.Tensor], imgsz: int, device: torch.device
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """Return heatmap, class ids, box regressions and positive mask targets."""
    grid = imgsz // STRIDE
    b = len(boxes_batch)
    heat = torch.zeros(b, 1, grid, grid, device=device)
    cls = torch.zeros(b, grid, grid, dtype=torch.long, device=device)
    reg = torch.zeros(b, 4, grid, grid, device=device)
    mask = torch.zeros(b, grid, grid, dtype=torch.bool, device=device)

    for bi, boxes in enumerate(boxes_batch):
        for row in boxes:
            c = int(row[0].item())
            cx, cy, w, h = (float(v) for v in row[1:])
            px, py = cx * imgsz, cy * imgsz
            pw, ph = max(1.0, w * imgsz), max(1.0, h * imgsz)
            gx = min(grid - 1, max(0, int(px / STRIDE)))
            gy = min(grid - 1, max(0, int(py / STRIDE)))
            # If a cell is already occupied, use the nearest free neighbour.
            if mask[bi, gy, gx]:
                placed = False
                for r in (1, -1):
                    for dy in range(-r, r + 1):
                        for dx in range(-r, r + 1):
                            ny, nx = gy + dy, gx + dx
                            if 0 <= ny < grid and 0 <= nx < grid and not mask[bi, ny, nx]:
                                gy, gx = ny, nx
                                placed = True
                                break
                        if placed:
                            break
                    if placed:
                        break
                if not placed:
                    continue
            heat[bi, 0, gy, gx] = 1.0
            cls[bi, gy, gx] = c
            reg[bi, 0, gy, gx] = (px - (gx + 0.5) * STRIDE) / STRIDE
            reg[bi, 1, gy, gx] = (py - (gy + 0.5) * STRIDE) / STRIDE
            reg[bi, 2, gy, gx] = math.log(max(1.0, pw) / STRIDE)
            reg[bi, 3, gy, gx] = math.log(max(1.0, ph) / STRIDE)
            mask[bi, gy, gx] = True
    return heat, cls, reg, mask


def focal_loss(pred_logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    """CenterNet penalty-reduced focal loss for the objectness heatmap."""
    p = torch.sigmoid(pred_logits).clamp(1e-4, 1 - 1e-4)
    pos = target.eq(1).float()
    neg = 1.0 - pos
    pos_loss = -((1 - p) ** 2) * torch.log(p) * pos
    neg_loss = -((1 - target) ** 4) * (p**2) * torch.log(1 - p) * neg
    num_pos = pos.sum().clamp(min=1.0)
    return (pos_loss.sum() + neg_loss.sum()) / num_pos


def compute_loss(out: torch.Tensor, heat, cls, reg, mask):
    pred_heat = out[:, 0:1]
    pred_cls = out[:, 1 : 1 + NUM_CLASSES]
    pred_reg = out[:, 1 + NUM_CLASSES : 1 + NUM_CLASSES + 4]

    l_obj = focal_loss(pred_heat, heat)
    if mask.any():
        logits = pred_cls.permute(0, 2, 3, 1)[mask]
        l_cls = F.cross_entropy(logits, cls[mask])
        pr = pred_reg.permute(0, 2, 3, 1)[mask]
        tr = reg.permute(0, 2, 3, 1)[mask]
        l_box = F.smooth_l1_loss(pr, tr, beta=0.1)
    else:
        l_cls = out.sum() * 0.0
        l_box = out.sum() * 0.0
    return l_obj + l_cls + 2.0 * l_box, {
        "obj": float(l_obj.detach()),
        "cls": float(l_cls.detach()),
        "box": float(l_box.detach()),
    }


def nms_numpy(boxes: np.ndarray, scores: np.ndarray, classes: np.ndarray, iou_thr: float, max_det: int):
    order = np.argsort(-scores)
    keep = []
    for i in order:
        ok = True
        for j in keep:
            if classes[i] != classes[j]:
                continue
            x0 = max(boxes[i, 0], boxes[j, 0])
            y0 = max(boxes[i, 1], boxes[j, 1])
            x1 = min(boxes[i, 2], boxes[j, 2])
            y1 = min(boxes[i, 3], boxes[j, 3])
            inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
            if inter <= 0:
                continue
            a = max(1e-6, (boxes[i, 2] - boxes[i, 0]) * (boxes[i, 3] - boxes[i, 1]))
            b = max(1e-6, (boxes[j, 2] - boxes[j, 0]) * (boxes[j, 3] - boxes[j, 1]))
            if inter / (a + b - inter) > iou_thr:
                ok = False
                break
        if ok:
            keep.append(i)
            if len(keep) >= max_det:
                break
    return np.asarray(keep, dtype=np.int64)


def decode_numpy(
    output: np.ndarray,
    imgsz: int,
    conf: float = 0.3,
    iou: float = 0.45,
    max_det: int = 300,
    stride: int = STRIDE,
):
    """Decode the raw [1, 50, H, W] ONNX output into boxes.

    Returns (boxes Nx4 in pixels, scores N, classes N).
    """
    out = output[0]  # 50, h, w
    obj = 1.0 / (1.0 + np.exp(-out[0]))
    cls_logits = out[1 : 1 + NUM_CLASSES]
    exp = np.exp(cls_logits - cls_logits.max(axis=0, keepdims=True))
    probs = exp / exp.sum(axis=0, keepdims=True)
    grid_h, grid_w = obj.shape
    # 3x3 max-pool peak extraction (vectorised)
    padded = np.pad(obj, 1, mode="constant", constant_values=-1)
    peaks = obj >= np.max(
        np.stack(
            [
                padded[dy : dy + grid_h, dx : dx + grid_w]
                for dy in range(3)
                for dx in range(3)
            ]
        ),
        axis=0,
    )
    ys, xs = np.nonzero(peaks & (obj > conf))
    if len(xs) == 0:
        return np.zeros((0, 4), np.float32), np.zeros((0,), np.float32), np.zeros((0,), np.int64)
    reg = out[1 + NUM_CLASSES : 1 + NUM_CLASSES + 4]
    cls_idx = probs[:, ys, xs].argmax(axis=0)
    cls_score = probs[cls_idx, ys, xs]
    scores = obj[ys, xs] * cls_score

    dx = reg[0, ys, xs]
    dy = reg[1, ys, xs]
    logw = reg[2, ys, xs]
    logh = reg[3, ys, xs]
    cx = (xs + 0.5 + dx) * stride
    cy = (ys + 0.5 + dy) * stride
    w = np.exp(np.clip(logw, -3.0, 3.5)) * stride
    h = np.exp(np.clip(logh, -3.0, 3.5)) * stride
    boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1).astype(np.float32)
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, imgsz)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, imgsz)
    valid = (boxes[:, 2] - boxes[:, 0] > 1.5) & (boxes[:, 3] - boxes[:, 1] > 1.5)
    boxes, scores, cls_idx = boxes[valid], scores[valid], cls_idx[valid]
    keep = nms_numpy(boxes, scores, cls_idx, iou, max_det)
    return boxes[keep], scores[keep], cls_idx[keep]


def box_iou(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    if len(a) == 0 or len(b) == 0:
        return np.zeros((len(a), len(b)), np.float32)
    x0 = np.maximum(a[:, None, 0], b[None, :, 0])
    y0 = np.maximum(a[:, None, 1], b[None, :, 1])
    x1 = np.minimum(a[:, None, 2], b[None, :, 2])
    y1 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.clip(x1 - x0, 0, None) * np.clip(y1 - y0, 0, None)
    area_a = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
    area_b = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
    return inter / np.clip(area_a[:, None] + area_b[None, :] - inter, 1e-6, None)


def average_precision(recall: np.ndarray, precision: np.ndarray) -> float:
    mrec = np.concatenate([[0.0], recall, [1.0]])
    mpre = np.concatenate([[0.0], precision, [0.0]])
    for i in range(len(mpre) - 2, -1, -1):
        mpre[i] = max(mpre[i], mpre[i + 1])
    idx = np.where(mrec[1:] != mrec[:-1])[0]
    return float(np.sum((mrec[idx + 1] - mrec[idx]) * mpre[idx + 1]))


def evaluate_arrays(
    predictions: list[tuple[np.ndarray, np.ndarray, np.ndarray]],
    ground_truth: list[tuple[np.ndarray, np.ndarray]],
    iou_thr: float = 0.5,
) -> dict:
    """Compute mAP50, precision and recall from decoded predictions.

    predictions[i] = (boxes Nx4, scores N, classes N)
    ground_truth[i] = (boxes Mx4, classes M)
    """
    aps = []
    total_tp = total_fp = total_fn = 0
    for c in range(NUM_CLASSES):
        all_scores = []
        all_tp = []
        npos = 0
        for (pboxes, pscores, pclasses), (gboxes, gclasses) in zip(predictions, ground_truth):
            mask = pclasses == c
            pb = pboxes[mask]
            ps = pscores[mask]
            gmask = gclasses == c
            gb = gboxes[gmask]
            npos += len(gb)
            ious = box_iou(pb, gb)
            matched = np.zeros(len(gb), dtype=bool)
            for i in np.argsort(-ps):
                if len(gb) == 0:
                    all_scores.append(ps[i])
                    all_tp.append(0)
                    continue
                j = int(np.argmax(ious[i]))
                if ious[i, j] >= iou_thr and not matched[j]:
                    matched[j] = True
                    all_scores.append(ps[i])
                    all_tp.append(1)
                else:
                    all_scores.append(ps[i])
                    all_tp.append(0)
            tp_img = int(matched.sum())
            total_tp += tp_img
            total_fp += len(pb) - tp_img
            total_fn += len(gb) - tp_img
        if npos == 0:
            continue
        if not all_scores:
            aps.append(0.0)
            continue
        order = np.argsort(-np.asarray(all_scores))
        tp = np.asarray(all_tp)[order]
        fp = 1 - tp
        cum_tp = np.cumsum(tp)
        cum_fp = np.cumsum(fp)
        recall = cum_tp / npos
        precision = cum_tp / np.clip(cum_tp + cum_fp, 1e-6, None)
        aps.append(average_precision(recall, precision))
    precision_all = total_tp / max(1, total_tp + total_fp)
    recall_all = total_tp / max(1, total_tp + total_fn)
    return {
        "mAP50": float(np.mean(aps)) if aps else 0.0,
        "precision@0.5": float(precision_all),
        "recall@0.5": float(recall_all),
    }


def evenly_sample(items: list, n: int, seed: int = 0) -> list:
    if n >= len(items):
        return list(items)
    rng = random.Random(seed)
    return rng.sample(items, n)

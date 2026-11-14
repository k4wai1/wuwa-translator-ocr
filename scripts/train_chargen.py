#!/usr/bin/env python3
"""Train SolarisCharNet, a lightweight center-based character detector.

Why not YOLOv8n? The target machine is a 2-core Celeron without AVX. A YOLOv8n
batch at 320 px takes ~12 s there, making a 45-epoch run take days. This network
trains ~10x faster and is tiny enough to run in the browser at 160–192 px.

Dataset: scripts/generate_dataset.py --profile micro --out training/micro
"""
from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from chargen import (
    NUM_CLASSES,
    STRIDE,
    CharDataset,
    SolarisCharNet,
    build_targets,
    collate,
    compute_loss,
    decode_numpy,
    evaluate_arrays,
)

ROOT = Path(__file__).resolve().parent.parent


def lr_factor(epoch: float, warmup: float, total: float, min_ratio: float = 0.02) -> float:
    if epoch < warmup:
        return max(0.05, epoch / max(1e-6, warmup))
    t = (epoch - warmup) / max(1e-6, total - warmup)
    return min_ratio + (1 - min_ratio) * 0.5 * (1 + math.cos(math.pi * t))


@torch.no_grad()
def evaluate(model, loader, imgsz: int, device, conf: float = 0.15, compute_map: bool = True) -> dict:
    model.eval()
    total_loss = 0.0
    n_batches = 0
    preds = []
    gts = []
    for imgs, boxes_batch in loader:
        imgs = imgs.to(device)
        heat, cls, reg, mask = build_targets(boxes_batch, imgsz, device)
        out = model(imgs)
        loss, _ = compute_loss(out, heat, cls, reg, mask)
        total_loss += float(loss)
        n_batches += 1
        if not compute_map:
            continue
        arr = out.detach().cpu().numpy()
        for i, boxes in enumerate(boxes_batch):
            pboxes, pscores, pclasses = decode_numpy(arr[i : i + 1], imgsz, conf=conf, max_det=100)
            preds.append((pboxes, pscores, pclasses))
            # GT: cx,cy,w,h normalized -> x0,y0,x1,y1 pixels
            b = boxes.cpu().numpy()
            if len(b):
                cx, cy, w, h = b[:, 1] * imgsz, b[:, 2] * imgsz, b[:, 3] * imgsz, b[:, 4] * imgsz
                g = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)
                gts.append((g.astype(np.float32), b[:, 0].astype(np.int64)))
            else:
                gts.append((np.zeros((0, 4), np.float32), np.zeros((0,), np.int64)))
    metrics = {"loss": total_loss / max(1, n_batches)}
    if compute_map:
        metrics.update(evaluate_arrays(preds, gts, iou_thr=0.5))
    return metrics


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", default=str(ROOT / "training" / "micro"))
    ap.add_argument("--imgsz", type=int, default=192)
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--width", type=int, default=48)
    ap.add_argument("--warmup", type=float, default=2.0)
    ap.add_argument("--patience", type=int, default=8)
    ap.add_argument("--eval-every", type=int, default=2)
    ap.add_argument("--limit", type=int, default=0, help="Limit train images (smoke test)")
    ap.add_argument("--val-limit", type=int, default=0)
    ap.add_argument("--out", default=str(ROOT / "training" / "chargen"))
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--init", default="", help="Checkpoint to fine-tune from")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    torch.set_num_threads(max(1, min(2, torch.get_num_threads())))
    device = torch.device("cpu")
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    root = Path(args.data)
    train_ds = CharDataset(root, "train", args.imgsz)
    val_ds = CharDataset(root, "val", args.imgsz)
    if args.limit:
        from chargen import evenly_sample

        train_ds.items = evenly_sample(train_ds.items, args.limit, args.seed)
    if args.val_limit:
        from chargen import evenly_sample

        val_ds.items = evenly_sample(val_ds.items, args.val_limit, args.seed + 1)
    print(f"[chargen] train={len(train_ds)} val={len(val_ds)} imgsz={args.imgsz}")

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch,
        shuffle=True,
        num_workers=args.workers,
        collate_fn=collate,
        drop_last=True,
        persistent_workers=args.workers > 0,
        prefetch_factor=2 if args.workers > 0 else None,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch,
        shuffle=False,
        num_workers=args.workers,
        collate_fn=collate,
        persistent_workers=args.workers > 0,
        prefetch_factor=2 if args.workers > 0 else None,
    )

    model = SolarisCharNet(NUM_CLASSES, width=args.width).to(device)
    if args.init:
        _ck = torch.load(args.init, map_location=device, weights_only=False)
        model.load_state_dict(_ck["model"])
        print(f"[chargen] initialized from {args.init} (epoch {_ck.get('epoch')})")
    n_params = sum(p.numel() for p in model.parameters())
    print(f"[chargen] parameters={n_params:,}")
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)

    start_epoch = 0
    best_map = -1.0
    best_epoch = 0
    history = []
    if args.resume:
        ckpt_path = out_dir / "last.pt"
        if ckpt_path.exists():
            ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
            model.load_state_dict(ckpt["model"])
            optimizer.load_state_dict(ckpt["optimizer"])
            start_epoch = ckpt["epoch"] + 1
            best_map = ckpt.get("best_map", -1.0)
            history = ckpt.get("history", [])
            print(f"[chargen] resumed at epoch {start_epoch}")

    steps_per_epoch = max(1, len(train_loader))
    global_step = start_epoch * steps_per_epoch
    total_steps = args.epochs * steps_per_epoch
    print_every = max(10, steps_per_epoch // 4)
    started = time.time()

    for epoch in range(start_epoch, args.epochs):
        model.train()
        epoch_loss = 0.0
        parts = {"obj": 0.0, "cls": 0.0, "box": 0.0}
        for it, (imgs, boxes_batch) in enumerate(train_loader):
            frac = epoch + it / steps_per_epoch
            lr = args.lr * lr_factor(frac, args.warmup, args.epochs)
            for group in optimizer.param_groups:
                group["lr"] = lr
            imgs = imgs.to(device)
            heat, cls, reg, mask = build_targets(boxes_batch, args.imgsz, device)
            out = model(imgs)
            loss, detail = compute_loss(out, heat, cls, reg, mask)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 10.0)
            optimizer.step()
            epoch_loss += float(loss.detach())
            for k in parts:
                parts[k] += detail[k]
            global_step += 1
            if (it + 1) % print_every == 0 or it + 1 == len(train_loader):
                avg = epoch_loss / (it + 1)
                print(
                    f"[chargen] epoch {epoch + 1}/{args.epochs} step {it + 1}/{len(train_loader)} "
                    f"loss={avg:.4f} (obj {parts['obj']/(it+1):.3f} cls {parts['cls']/(it+1):.3f} "
                    f"box {parts['box']/(it+1):.3f}) lr={lr:.2e}",
                    flush=True,
                )

        compute_map = ((epoch + 1) % max(1, args.eval_every) == 0) or (epoch == args.epochs - 1)
        metrics = evaluate(model, val_loader, args.imgsz, device, compute_map=compute_map)
        metrics["epoch"] = epoch + 1
        metrics["train_loss"] = epoch_loss / max(1, len(train_loader))
        metrics["lr"] = lr
        metrics["elapsed_s"] = round(time.time() - started, 1)
        history.append(metrics)
        map_txt = f"mAP50={metrics['mAP50']:.4f} P={metrics['precision@0.5']:.3f} R={metrics['recall@0.5']:.3f}" if compute_map else "mAP50=(skip)"
        print(
            f"[chargen] VAL epoch {epoch + 1}: loss={metrics['loss']:.4f} {map_txt} "
            f"({metrics['elapsed_s']}s)",
            flush=True,
        )

        ckpt = {
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "epoch": epoch,
            "best_map": best_map,
            "config": {
                "imgsz": args.imgsz,
                "stride": STRIDE,
                "num_classes": NUM_CLASSES,
                "width": args.width,
            },
            "history": history,
        }
        torch.save(ckpt, out_dir / "last.pt")
        if compute_map and metrics["mAP50"] > best_map:
            best_map = metrics["mAP50"]
            best_epoch = epoch
            ckpt["best_map"] = best_map
            torch.save(ckpt, out_dir / "best.pt")
            print(f"[chargen] new best mAP50={best_map:.4f} -> best.pt", flush=True)

        (out_dir / "metrics.json").write_text(
            json.dumps(
                {
                    "params": n_params,
                    "imgsz": args.imgsz,
                    "epochs": args.epochs,
                    "history": history,
                    "best_map50": best_map,
                },
                indent=2,
            )
        )
        if compute_map and epoch - best_epoch >= args.patience:
            print(f"[chargen] early stop at epoch {epoch + 1} (patience {args.patience})")
            break

    print(f"[chargen] done in {time.time() - started:.1f}s · best mAP50={best_map:.4f}")


if __name__ == "__main__":
    main()

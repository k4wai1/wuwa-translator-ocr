#!/usr/bin/env python3
"""Export SolarisCharNet to ONNX, validate it and install it in public/models.

The network is tiny (~100 KB), so the FP32 graph is shipped directly: no
quantization is needed and browser compatibility is maximal.
"""
from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path

import numpy as np
import torch

from chargen import (
    NUM_CLASSES,
    STRIDE,
    CharDataset,
    SolarisCharNet,
    decode_numpy,
    evaluate_arrays,
    load_image,
)

ROOT = Path(__file__).resolve().parent.parent


def evaluate_onnx(ort, session, dataset, imgsz: int, conf: float = 0.15, max_images: int = 250) -> dict:
    preds = []
    gts = []
    input_name = session.get_inputs()[0].name
    for idx in range(min(max_images, len(dataset))):
        img, boxes = dataset[idx]
        out = session.run(None, {input_name: img.unsqueeze(0).numpy()})[0]
        pboxes, pscores, pclasses = decode_numpy(out, imgsz, conf=conf, max_det=100)
        preds.append((pboxes, pscores, pclasses))
        b = boxes.numpy()
        if len(b):
            cx, cy, w, h = b[:, 1] * imgsz, b[:, 2] * imgsz, b[:, 3] * imgsz, b[:, 4] * imgsz
            g = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)
            gts.append((g.astype(np.float32), b[:, 0].astype(np.int64)))
        else:
            gts.append((np.zeros((0, 4), np.float32), np.zeros((0,), np.int64)))
    return evaluate_arrays(preds, gts, 0.5)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--weights", default=str(ROOT / "training" / "chargen" / "best.pt"))
    ap.add_argument("--data", default=str(ROOT / "training" / "micro"))
    ap.add_argument("--imgsz", type=int, default=192)
    ap.add_argument("--out", default=str(ROOT / "public" / "models" / "model.onnx"))
    ap.add_argument("--skip-eval", action="store_true")
    args = ap.parse_args()

    weights = Path(args.weights)
    if not weights.exists():
        raise SystemExit(f"Weights not found: {weights}")
    ckpt = torch.load(weights, map_location="cpu", weights_only=False)
    cfg = ckpt.get("config", {})
    width = int(cfg.get("width", 48))
    imgsz = int(cfg.get("imgsz", args.imgsz))
    model = SolarisCharNet(NUM_CLASSES, width=width)
    model.load_state_dict(ckpt["model"])
    model.eval()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = ROOT / "training" / "chargen" / "model-fp32.onnx"
    dummy = torch.zeros(1, 3, imgsz, imgsz)
    torch.onnx.export(
        model,
        dummy,
        str(tmp),
        input_names=["images"],
        output_names=["output0"],
        opset_version=12,
        do_constant_folding=True,
        dynamic_axes=None,
        dynamo=False,
    )
    shutil.copy2(tmp, out_path)
    print(f"[export] model -> {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")

    report = {
        "weights": str(weights),
        "imgsz": imgsz,
        "stride": STRIDE,
        "width": width,
        "params": sum(p.numel() for p in model.parameters()),
        "size_kb": round(out_path.stat().st_size / 1024, 1),
        "torch_best_map50": ckpt.get("best_map"),
        "epoch": ckpt.get("epoch"),
    }

    if not args.skip_eval:
        import onnxruntime as ort

        val_ds = CharDataset(Path(args.data), "val", imgsz)
        session = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
        metrics = evaluate_onnx(ort, session, val_ds, imgsz)
        report["onnx_val"] = metrics
        print(f"[export] ONNX val: {json.dumps(metrics)}")

    meta = {
        "arch": "chargen",
        "imgsz": imgsz,
        "stride": STRIDE,
        "numClasses": NUM_CLASSES,
        "width": width,
        "inputName": "images",
        "outputName": "output0",
        "periodClass": "A",
        "trainedAt": datetime.utcnow().isoformat() + "Z",
        "metrics": report.get("onnx_val"),
        "sizeKB": report["size_kb"],
    }
    (ROOT / "src" / "lib" / "model-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (ROOT / "training" / "chargen" / "export_report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

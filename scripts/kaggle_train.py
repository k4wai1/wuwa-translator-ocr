#!/usr/bin/env python3
"""End-to-end Kaggle/local training driver for the Solaris-3 OCR models.

It generates a clean dataset, trains the detector (SolarisCharNet) and the
32x32 glyph classifier (GlyphNet), exports both to ONNX on CPU and verifies
them with onnxruntime's CPUExecutionProvider (the same runtime family as
onnxruntime-web in the browser).

Typical Kaggle usage (GPU T4):
    !git clone https://github.com/<user>/wuwa-translator-ocr /kaggle/working/repo
    %cd /kaggle/working/repo
    !python scripts/kaggle_train.py --gpu

Local CPU fallback:
    python scripts/kaggle_train.py --cpu
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"

GPU_PROFILE = dict(train=12000, val=1500, width=64, epochs=45, batch=64)
CPU_PROFILE = dict(train=3500, val=400, width=48, epochs=30, batch=16)


def run(cmd: list[str], log: Path | None = None) -> None:
    print("[kaggle]", " ".join(cmd), flush=True)
    t0 = time.time()
    if log is None:
        subprocess.run(cmd, check=True, cwd=ROOT)
    else:
        with log.open("a") as fh:
            subprocess.run(cmd, check=True, cwd=ROOT, stdout=fh, stderr=subprocess.STDOUT)
    print(f"[kaggle] done in {time.time() - t0:.0f}s", flush=True)


def has_cuda() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", default=str(ROOT / "training" / "micro"))
    ap.add_argument("--out", default=str(ROOT / "training"))
    ap.add_argument("--gpu", action="store_true", help="Force the GPU profile")
    ap.add_argument("--cpu", action="store_true", help="Force the CPU profile")
    ap.add_argument("--regen", action="store_true", help="Regenerate the dataset")
    ap.add_argument("--skip-detector", action="store_true")
    ap.add_argument("--skip-classifier", action="store_true")
    ap.add_argument("--workers", type=int, default=min(4, os.cpu_count() or 2))
    args = ap.parse_args()

    cuda = has_cuda() and not args.cpu
    prof = GPU_PROFILE if (args.gpu or cuda) else CPU_PROFILE
    out = Path(args.out)
    data = Path(args.data) if args.data else out / "micro"
    out.mkdir(parents=True, exist_ok=True)
    print(f"[kaggle] cuda={cuda} profile={prof} data={data}", flush=True)

    # ---- Stage A: clean synthetic dataset -----------------------------------
    meta_file = data / "dataset_meta.json"
    if args.regen or not meta_file.exists():
        if data.exists():
            shutil.rmtree(data)
        run([sys.executable, str(SCRIPTS / "generate_dataset.py"),
             "--profile", "micro", "--out", str(data),
             "--train", str(prof["train"]), "--val", str(prof["val"]),
             "--workers", str(args.workers)])
    meta = json.loads((data / "dataset_meta.json").read_text())
    print(f"[kaggle] dataset images={meta['images']} boxes={meta['boxes']} "
          f"missing={meta['missing_classes']} classRange={meta['class_min']}-{meta['class_max']}",
          flush=True)

    det_dir = out / "chargen_kaggle"
    clf_dir = out / "classifier_kaggle"

    # ---- Stage B: detector ---------------------------------------------------
    if not args.skip_detector:
        run([sys.executable, str(SCRIPTS / "train_chargen.py"),
             "--data", str(data), "--imgsz", "192",
             "--epochs", str(prof["epochs"]), "--batch", str(prof["batch"]),
             "--width", str(prof["width"]), "--eval-every", "3",
             "--workers", str(min(4, args.workers)), "--val-limit", "600",
             "--patience", str(prof["epochs"]), "--out", str(det_dir)],
            log=out / "chargen_kaggle.log")
        best = det_dir / "best.pt"
        if not best.exists():
            raise SystemExit("detector training produced no checkpoint")
        run([sys.executable, str(SCRIPTS / "export_chargen.py"),
             "--weights", str(best), "--out", str(ROOT / "public" / "models" / "model.onnx"),
             "--skip-eval"])

    # ---- Stage C: classifier -------------------------------------------------
    if not args.skip_classifier:
        run([sys.executable, str(SCRIPTS / "train_classifier.py"),
             "--data", str(data), "--epochs", "25", "--batch",
             "256" if cuda else "128", "--workers", str(min(2, args.workers)),
             "--out", str(clf_dir)],
            log=out / "classifier_kaggle.log")
        shutil.copy2(clf_dir / "classifier.onnx",
                     ROOT / "public" / "models" / "classifier.onnx")
        meta_clf = json.loads((clf_dir / "meta.json").read_text())
    else:
        meta_clf = {}

    # ---- Stage D: CPU verification + metadata --------------------------------
    models = ROOT / "public" / "models"
    try:
        import onnxruntime as ort
        for name in ("model.onnx", "classifier.onnx"):
            sess = ort.InferenceSession(str(models / name), providers=["CPUExecutionProvider"])
            print(f"[kaggle] {name}: {sess.get_inputs()[0].shape} -> "
                  f"{sess.get_outputs()[0].shape} {(models / name).stat().st_size / 1024:.1f} KB", flush=True)
    except ImportError:
        print("[kaggle] onnxruntime not installed; skipping runtime check", flush=True)

    report = {}
    for name in ("export_report.json", "metrics.json"):
        cand = det_dir / name
        if cand.exists():
            report = json.loads(cand.read_text())
            break
    det_map = float((report.get("onnx_val") or {}).get("mAP50", report.get("best_map50", 0.0)) or 0.0)
    det_width = int(report.get("width", prof["width"]))
    app_meta = {
        "arch": "chargen",
        "imgsz": 192,
        "stride": 4,
        "numClasses": 45,
        "width": det_width,
        "inputName": "images",
        "outputName": "output0",
        "periodClass": "A",
        "sizeKB": round((models / "model.onnx").stat().st_size / 1024, 1),
        "metrics": {
            "detector_mAP50": det_map,
            "pipeline_mAP50": det_map,
            "classifier_val_acc": meta_clf.get("val_acc", 0.0),
            "eval_images": meta.get("images", 0),
            "profile": "gpu" if cuda else "cpu",
            "note": "dataset limpio con heatmap Gaussiano, contraste garantizado y clase 45 de ruido.",
        },
        "classifier": {
            "imgsz": 32,
            "inputName": "images",
            "outputName": "logits",
            "valAcc": meta_clf.get("val_acc", 0.0),
            "noiseClass": 45,
        },
    }
    (ROOT / "src" / "lib" / "model-meta.json").write_text(json.dumps(app_meta, indent=2) + "\n")
    print("[kaggle] wrote src/lib/model-meta.json", flush=True)


if __name__ == "__main__":
    main()

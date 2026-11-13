#!/usr/bin/env python3
"""Export the trained detector to ONNX, quantize it and validate both variants.

Outputs:
  public/models/model.onnx        (the variant the web app loads)
  public/models/model-fp32.onnx   (kept for comparison)
  public/models/model-int8.onnx   (dynamic int8, only if it validates well)
  src/lib/model-meta.json         (imgsz + metrics consumed by the app)
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def metrics_to_json(metrics) -> dict:
    return {k: float(v) for k, v in metrics.results_dict.items()}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--weights",
        default=str(ROOT / "training" / "runs" / "solaris_yolov8n_416" / "weights" / "best.pt"),
    )
    ap.add_argument("--imgsz", type=int, default=416)
    ap.add_argument("--data", default=str(ROOT / "training" / "dataset" / "data.yaml"))
    ap.add_argument("--skip-val", action="store_true")
    ap.add_argument("--no-int8", action="store_true")
    args = ap.parse_args()

    from ultralytics import YOLO

    weights = Path(args.weights)
    if not weights.exists():
        raise SystemExit(f"Weights not found: {weights}")
    out_dir = ROOT / "public" / "models"
    out_dir.mkdir(parents=True, exist_ok=True)

    model = YOLO(str(weights))
    export_path = model.export(
        format="onnx",
        imgsz=args.imgsz,
        opset=12,
        simplify=True,
        dynamic=False,
        half=False,
        batch=1,
        device="cpu",
    )
    fp32 = Path(str(export_path))
    if not fp32.exists():
        fp32 = weights.parent / (weights.stem + ".onnx")
    fp32_dst = out_dir / "model-fp32.onnx"
    shutil.copy2(fp32, fp32_dst)
    print(f"[export] fp32 -> {fp32_dst} ({fp32_dst.stat().st_size / 1e6:.2f} MB)")

    report: dict = {"imgsz": args.imgsz, "fp32_mb": round(fp32_dst.stat().st_size / 1e6, 2)}
    int8_dst = out_dir / "model-int8.onnx"
    int8_ok = False
    if not args.no_int8:
        from onnxruntime.quantization import QuantType, quantize_dynamic

        try:
            quantize_dynamic(str(fp32_dst), str(int8_dst), weight_type=QuantType.QInt8)
            print(f"[export] int8 -> {int8_dst} ({int8_dst.stat().st_size / 1e6:.2f} MB)")
            report["int8_mb"] = round(int8_dst.stat().st_size / 1e6, 2)
            int8_ok = True
        except Exception as exc:  # noqa: BLE001
            report["int8_error"] = repr(exc)
            print(f"[export] int8 quantization failed: {exc}")

    if not args.skip_val:
        try:
            print("[export] validating fp32 with Ultralytics + ONNX Runtime…")
            m32 = YOLO(str(fp32_dst)).val(
                data=args.data,
                imgsz=args.imgsz,
                batch=8,
                workers=0,
                device="cpu",
                project=str(ROOT / "training" / "runs"),
                name="onnx_fp32_val",
                exist_ok=True,
            )
            report["fp32_metrics"] = metrics_to_json(m32)
            print(json.dumps(report["fp32_metrics"], indent=2))
        except Exception as exc:  # noqa: BLE001
            report["fp32_val_error"] = repr(exc)
            print(f"[export] fp32 validation failed: {exc}")

        if int8_ok:
            try:
                print("[export] validating int8…")
                m8 = YOLO(str(int8_dst)).val(
                    data=args.data,
                    imgsz=args.imgsz,
                    batch=8,
                    workers=0,
                    device="cpu",
                    project=str(ROOT / "training" / "runs"),
                    name="onnx_int8_val",
                    exist_ok=True,
                )
                report["int8_metrics"] = metrics_to_json(m8)
                print(json.dumps(report["int8_metrics"], indent=2))
            except Exception as exc:  # noqa: BLE001
                report["int8_val_error"] = repr(exc)
                print(f"[export] int8 validation failed: {exc}")

    # Choose the smallest variant that keeps mAP50 close to fp32 (fallback: fp32).
    chosen = fp32_dst
    map32 = report.get("fp32_metrics", {}).get("metrics/mAP50(B)")
    map8 = report.get("int8_metrics", {}).get("metrics/mAP50(B)")
    if int8_ok and map32 is not None and map8 is not None and map8 >= map32 - 0.02:
        chosen = int8_dst
    elif int8_ok and map32 is None:
        # No validation available: prefer fp32 for safety.
        chosen = fp32_dst
    shutil.copy2(chosen, out_dir / "model.onnx")
    report["chosen"] = chosen.name
    report["model_mb"] = round((out_dir / "model.onnx").stat().st_size / 1e6, 2)

    meta = {
        "imgsz": args.imgsz,
        "inputName": "images",
        "outputName": "output0",
        "classes": 45,
        "periodClass": "A",
        "trainedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "metrics": {
            "fp32": report.get("fp32_metrics"),
            "int8": report.get("int8_metrics"),
            "chosen": report["chosen"],
        },
        "weights": str(weights),
    }
    (ROOT / "src" / "lib" / "model-meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    (ROOT / "training" / "export_report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

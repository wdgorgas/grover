from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import sys
from pathlib import Path
from typing import Any

from .hardware import hardware_report
from .runtime import atomic_write_json, dataset_path, load_config, model_path, runtime_root, update_status

REQUIRED_PACKAGES = ("torch", "transformers", "peft", "accelerate", "bitsandbytes", "jsonschema")


def package_versions() -> tuple[dict[str, str], list[str]]:
    versions: dict[str, str] = {}
    missing: list[str] = []
    for name in REQUIRED_PACKAGES:
        try:
            versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            missing.append(name)
    return versions, missing


def verify_dataset(path: Path) -> list[str]:
    errors: list[str] = []
    manifest_path = path / "manifest.json"
    if not manifest_path.exists():
        return [f"Dataset manifest is missing: {manifest_path}"]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for split in ("train", "validation", "test", "review"):
        split_path = path / f"{split}.jsonl"
        if not split_path.exists():
            errors.append(f"Dataset split is missing: {split_path}")
            continue
        digest = hashlib.sha256(split_path.read_bytes()).hexdigest()
        if digest != manifest.get("sha256", {}).get(split):
            errors.append(f"Dataset hash mismatch: {split}")
    return errors


def verify_model(path: Path) -> list[str]:
    required = (path / "config.json", path / "tokenizer_config.json")
    errors = [f"Base-model file is missing: {item}" for item in required if not item.exists()]
    if not list(path.glob("*.safetensors")):
        errors.append(f"Base-model weights are missing: {path}")
    return errors


def run(config_path: Path, *, require_packages: bool, mode: str) -> dict[str, Any]:
    config = load_config(config_path)
    root = runtime_root()
    root.mkdir(parents=True, exist_ok=True)
    hardware = hardware_report(config, root)
    versions, missing = package_versions()
    errors = verify_dataset(dataset_path(config, root))
    if sys.version_info[:2] != (3, 12):
        errors.append(f"Python 3.12 is required; running {sys.version_info.major}.{sys.version_info.minor}.")
    minimum_disk = float(config["storage"][f"minimum_free_gb_{mode}"])
    if float(hardware["free_disk_gb"]) < minimum_disk:
        errors.append(f"Only {hardware['free_disk_gb']} GB is free; {minimum_disk:.0f} GB is required for {mode}.")
    if mode == "train" and not hardware["profile_settings"].get("training_supported", False):
        errors.append("No supported NVIDIA GPU with at least 3.5 GB VRAM was detected.")
    if mode == "train":
        selected_gpu = hardware.get("selected_gpu")
        minimum_free_vram = int(hardware["profile_settings"].get("minimum_free_vram_mb", 0))
        if selected_gpu and int(selected_gpu["free_vram_mb"]) < minimum_free_vram:
            errors.append(
                f"Only {selected_gpu['free_vram_mb']} MB GPU memory is free; close GPU-heavy apps to provide at least {minimum_free_vram} MB."
            )
        errors.extend(verify_model(model_path(root)))
    if require_packages and missing:
        errors.append(f"Missing packages: {', '.join(missing)}")
    result = {
        "status": "pass" if not errors else "fail",
        "mode": mode,
        "python": sys.version,
        "runtime_root": str(root),
        "dataset": str(dataset_path(config, root)),
        "model_path": str(model_path(root)),
        "hardware": hardware,
        "packages": versions,
        "missing_packages": missing,
        "errors": errors,
    }
    report_path = root / "reports" / f"preflight_{mode}.json"
    atomic_write_json(report_path, result)
    update_status("preflight", result["status"], report=str(report_path), errors=errors)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Check manager training hardware, storage, packages, and dataset integrity.")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--mode", choices=("prepare", "train"), default="train")
    parser.add_argument("--allow-missing-packages", action="store_true")
    args = parser.parse_args()
    result = run(args.config, require_packages=not args.allow_missing_packages, mode=args.mode)
    print(json.dumps(result, indent=2))
    if result["status"] != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()

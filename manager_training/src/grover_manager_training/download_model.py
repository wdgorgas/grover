from __future__ import annotations

import argparse
import json
from pathlib import Path

from .runtime import load_config, model_path, runtime_root, update_status


def main() -> None:
    parser = argparse.ArgumentParser(description="Download the pinned GROVER Manager base model into the local cache.")
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    from huggingface_hub import snapshot_download

    config = load_config(args.config)
    root = runtime_root()
    destination = model_path(root)
    destination.mkdir(parents=True, exist_ok=True)
    update_status("prepare", "downloading_model", model_id=config["model_id"], destination=str(destination))
    location = snapshot_download(
        repo_id=str(config["model_id"]),
        local_dir=destination,
        allow_patterns=("*.json", "*.safetensors", "*.model", "*.jinja", "*.txt", "README.md", "LICENSE", "NOTICE"),
        max_workers=2,
    )
    update_status("prepare", "model_ready", model_id=config["model_id"], model_snapshot=location)
    print(json.dumps({"model_id": config["model_id"], "snapshot": location}, indent=2))


if __name__ == "__main__":
    main()

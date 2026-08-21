from __future__ import annotations

import argparse
import json
from pathlib import Path

from .runtime import atomic_write_json, model_path, runtime_root, utc_now


def main() -> None:
    parser = argparse.ArgumentParser(description="Export the effective NF4 base plus LoRA as a merged Hugging Face model.")
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    import torch
    from peft import PeftModel

    from .train import build_model

    root = runtime_root()
    base, tokenizer = build_model(str(model_path(root)), root / "scratch" / "transformers-cache", rank=8, add_lora=False)
    if not getattr(base, "is_loaded_in_4bit", False):
        raise RuntimeError("The export source must be the same four-bit NF4 base used for training.")
    base.dequantize()
    adapted = PeftModel.from_pretrained(base, str(args.adapter), is_trainable=False)
    merged = adapted.merge_and_unload(safe_merge=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(args.output_dir, safe_serialization=True, max_shard_size="2GB")
    tokenizer.save_pretrained(args.output_dir)
    manifest = {
        "created_at": utc_now(),
        "source_adapter": str(args.adapter.resolve()),
        "source_base": str(model_path(root).resolve()),
        "method": "bnb_nf4_dequantize_then_peft_safe_merge",
        "dtype": str(next(merged.parameters()).dtype),
        "cuda_peak_allocated_mb": round(torch.cuda.max_memory_allocated() / (1024**2), 1),
    }
    atomic_write_json(args.output_dir / "grover_merge_manifest.json", manifest)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()

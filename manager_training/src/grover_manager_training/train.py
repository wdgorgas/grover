from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from .contracts import load_system_prompt
from .hardware import hardware_report
from .runtime import atomic_write_json, dataset_path, load_config, model_path, runtime_root, update_status, utc_now, validate_run_name


def latest_checkpoint(output_dir: Path) -> Path | None:
    candidates = []
    for path in output_dir.glob("checkpoint-*"):
        try:
            step = int(path.name.rsplit("-", 1)[1])
        except ValueError:
            continue
        if (path / "trainer_state.json").exists():
            candidates.append((step, path))
    return max(candidates, default=(0, None), key=lambda item: item[0])[1]


def build_model(model_id: str, cache_dir: Path, rank: int, *, add_lora: bool = True) -> tuple[Any, Any]:
    import torch
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    cache_dir.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(model_id, cache_dir=cache_dir, use_fast=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.float16,
    )
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        cache_dir=cache_dir,
        quantization_config=quantization,
        device_map={"": 0},
        dtype=torch.float16,
        low_cpu_mem_usage=True,
    )
    if add_lora:
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
        lora = LoraConfig(
            r=rank,
            lora_alpha=rank * 2,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=("q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"),
        )
        model = get_peft_model(model, lora)
        model.config.use_cache = False
    return model, tokenizer


def main() -> None:
    parser = argparse.ArgumentParser(description="Run resumable QLoRA training for GROVER Manager.")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--training-root", type=Path, required=True)
    parser.add_argument("--run-name", default="manager-v1")
    parser.add_argument("--max-steps", type=int)
    parser.add_argument("--max-train-samples", type=int)
    parser.add_argument("--max-eval-samples", type=int)
    parser.add_argument("--checkpoint-steps", type=int, help="Dry-run override for testing resumable checkpoints.")
    parser.add_argument("--fresh", action="store_true", help="Ignore resumable checkpoints in this run directory.")
    args = parser.parse_args()
    args.run_name = validate_run_name(args.run_name)

    import torch
    from transformers import Trainer, TrainerCallback, TrainingArguments, set_seed

    from .training_data import CompletionCollator, CompletionDataset, balanced_sample, load_jsonl

    config = load_config(args.config)
    root = runtime_root()
    hardware = hardware_report(config, root)
    profile_name = str(hardware["profile"])
    profile = hardware["profile_settings"]
    if not profile.get("training_supported", False):
        raise RuntimeError("Training requires a supported NVIDIA GPU with at least 3.5 GB VRAM.")
    if not torch.cuda.is_available():
        raise RuntimeError("PyTorch cannot access CUDA even though NVIDIA hardware was detected.")

    output_dir = root / "outputs" / args.run_name
    final_dir = output_dir / "final-adapter"
    output_dir.mkdir(parents=True, exist_ok=True)
    log_dir = root / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(root / "scratch" / "hf-runtime"))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    set_seed(int(config["seed"]))
    update_status("training", "loading_model", run_name=args.run_name, profile=profile_name, output_dir=str(output_dir))
    model, tokenizer = build_model(str(model_path(root)), root / "scratch" / "transformers-cache", int(profile["lora_rank"]), add_lora=True)
    train_limit = args.max_train_samples or int(profile["max_train_samples"])
    eval_limit = args.max_eval_samples or int(profile["evaluation_samples"])
    data_dir = dataset_path(config, root)
    train_records = balanced_sample(load_jsonl(data_dir / "train.jsonl"), train_limit, int(config["seed"]))
    eval_records = balanced_sample(load_jsonl(data_dir / "validation.jsonl"), eval_limit, int(config["seed"]) + 1)
    system_prompt = load_system_prompt(args.training_root)
    max_length = int(profile["max_seq_length"])
    train_dataset = CompletionDataset(train_records, tokenizer, system_prompt, max_length)
    eval_dataset = CompletionDataset(eval_records, tokenizer, system_prompt, max_length)
    collator = CompletionCollator(int(tokenizer.pad_token_id))

    class StatusCallback(TrainerCallback):
        def on_log(self, training_args: Any, state: Any, control: Any, logs: dict[str, Any] | None = None, **kwargs: Any) -> None:
            update_status(
                "training", "running", run_name=args.run_name, step=int(state.global_step),
                max_steps=int(state.max_steps), progress=round(float(state.global_step) / max(1, int(state.max_steps)), 4),
                metrics=logs or {}, profile=profile_name,
            )

        def on_save(self, training_args: Any, state: Any, control: Any, **kwargs: Any) -> None:
            update_status("training", "checkpoint_saved", run_name=args.run_name, step=int(state.global_step), max_steps=int(state.max_steps))

    training = config["training"]
    kwargs: dict[str, Any] = {
        "output_dir": str(output_dir),
        "num_train_epochs": float(training["epochs"]),
        "per_device_train_batch_size": 1,
        "per_device_eval_batch_size": 1,
        "gradient_accumulation_steps": int(profile["gradient_accumulation_steps"]),
        "learning_rate": float(training["learning_rate"]),
        "warmup_ratio": float(training["warmup_ratio"]),
        "weight_decay": float(training["weight_decay"]),
        "max_grad_norm": float(training["max_grad_norm"]),
        "logging_steps": int(training["logging_steps"]),
        "save_strategy": "steps",
        "save_steps": int(training["save_steps"]),
        "save_total_limit": int(training["save_total_limit"]),
        "eval_strategy": "steps",
        "eval_steps": int(training["eval_steps"]),
        "fp16": True,
        "gradient_checkpointing": True,
        "gradient_checkpointing_kwargs": {"use_reentrant": False},
        "optim": "paged_adamw_8bit",
        "report_to": [],
        "remove_unused_columns": False,
        "dataloader_num_workers": int(profile.get("dataloader_workers", 0)),
        "dataloader_pin_memory": True,
        "seed": int(config["seed"]),
        "data_seed": int(config["seed"]),
    }
    if args.max_steps is not None:
        kwargs["max_steps"] = args.max_steps
        kwargs["eval_strategy"] = "no"
        if args.checkpoint_steps:
            kwargs["save_strategy"] = "steps"
            kwargs["save_steps"] = args.checkpoint_steps
        else:
            kwargs["save_strategy"] = "no"
        kwargs["logging_steps"] = 1
    training_args = TrainingArguments(**kwargs)
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=collator,
        callbacks=[StatusCallback()],
    )
    checkpoint = None if args.fresh else latest_checkpoint(output_dir)
    if final_dir.exists() and checkpoint is None and not args.fresh:
        raise RuntimeError(f"Completed run already exists without a resumable checkpoint: {final_dir}")
    run_manifest = {
        "started_at": utc_now(),
        "run_name": args.run_name,
        "model_id": config["model_id"],
        "profile": profile_name,
        "profile_settings": profile,
        "hardware": hardware,
        "train_examples": len(train_records),
        "validation_examples": len(eval_records),
        "max_steps_override": args.max_steps,
        "checkpoint_steps_override": args.checkpoint_steps,
        "resumed_from": str(checkpoint) if checkpoint else None,
        "dataset_manifest": json.loads((data_dir / "manifest.json").read_text(encoding="utf-8")),
    }
    atomic_write_json(output_dir / "run_manifest.json", run_manifest)
    update_status("training", "running", run_name=args.run_name, step=0, resumed_from=str(checkpoint) if checkpoint else None)
    try:
        torch.cuda.reset_peak_memory_stats()
        result = trainer.train(resume_from_checkpoint=str(checkpoint) if checkpoint else None)
        final_dir.mkdir(parents=True, exist_ok=True)
        trainer.save_model(str(final_dir))
        tokenizer.save_pretrained(str(final_dir))
        metrics = dict(result.metrics)
        metrics["gpu_peak_allocated_mb"] = round(torch.cuda.max_memory_allocated() / (1024**2), 1)
        metrics["gpu_peak_reserved_mb"] = round(torch.cuda.max_memory_reserved() / (1024**2), 1)
        metrics["completed_at"] = utc_now()
        atomic_write_json(output_dir / "training_metrics.json", metrics)
        update_status("training", "complete", run_name=args.run_name, final_adapter=str(final_dir), metrics=metrics)
        print(json.dumps(metrics, indent=2, default=str))
    except BaseException as error:
        update_status("training", "failed", run_name=args.run_name, error=f"{type(error).__name__}: {error}")
        raise


if __name__ == "__main__":
    main()

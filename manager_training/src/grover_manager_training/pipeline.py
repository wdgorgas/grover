from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from .hardware import hardware_report
from .runtime import dataset_path, load_config, runtime_root, update_status, validate_run_name


def run_module(module: str, arguments: list[str]) -> None:
    command = [sys.executable, "-m", module, *arguments]
    completed = subprocess.run(command, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"{module} failed with exit code {completed.returncode}")


def prepare(config_path: Path, training_root: Path, *, skip_download: bool) -> None:
    config = load_config(config_path)
    root = runtime_root()
    data_dir = dataset_path(config, root)
    update_status("prepare", "running", dataset=str(data_dir))
    if not data_dir.exists():
        run_module("grover_manager_training.generate_dataset", ["--config", str(config_path), "--output", str(data_dir)])
    run_module(
        "grover_manager_training.validate_dataset",
        [
            "--dataset", str(data_dir),
            "--schema", str(training_root / "schemas" / "manager_example_v1.schema.json"),
            "--report", str(root / "reports" / "dataset_validation.json"),
        ],
    )
    run_module("grover_manager_training.preflight", ["--config", str(config_path), "--mode", "prepare"])
    if not skip_download:
        run_module("grover_manager_training.download_model", ["--config", str(config_path)])
    run_module("grover_manager_training.preflight", ["--config", str(config_path), "--mode", "train"])
    update_status("prepare", "complete", dataset=str(data_dir), model_id=config["model_id"])


def start(
    config_path: Path,
    training_root: Path,
    run_name: str,
    *,
    max_steps: int | None,
    max_train_samples: int | None,
    max_eval_samples: int | None,
    skip_evaluation: bool,
) -> None:
    run_name = validate_run_name(run_name)
    config = load_config(config_path)
    root = runtime_root()
    update_status("pipeline", "starting", run_name=run_name)
    run_module("grover_manager_training.preflight", ["--config", str(config_path), "--mode", "train"])
    train_arguments = ["--config", str(config_path), "--training-root", str(training_root), "--run-name", run_name]
    if max_steps is not None:
        train_arguments += ["--max-steps", str(max_steps)]
    if max_train_samples is not None:
        train_arguments += ["--max-train-samples", str(max_train_samples)]
    if max_eval_samples is not None:
        train_arguments += ["--max-eval-samples", str(max_eval_samples)]
    run_module("grover_manager_training.train", train_arguments)
    adapter = root / "outputs" / run_name / "final-adapter"
    if not skip_evaluation:
        profile = hardware_report(config, root)["profile_settings"]
        evaluation_limit = max_eval_samples or int(profile["evaluation_samples"])
        run_module(
            "grover_manager_training.evaluate",
            [
                "--config", str(config_path), "--training-root", str(training_root), "--adapter", str(adapter),
                "--split", "test", "--limit", str(evaluation_limit),
            ],
        )
        report_path = root / "outputs" / run_name / "evaluation_test.json"
        report = json.loads(report_path.read_text(encoding="utf-8"))
        final_state = "complete" if report["status"] == "pass" else "complete_not_promoted"
        final_details = {"evaluation_report": str(report_path)}
    else:
        final_state = "complete_smoke"
        final_details = {}
    run_module("grover_manager_training.cleanup", ["--config", str(config_path), "--run-name", run_name])
    update_status("pipeline", final_state, run_name=run_name, adapter=str(adapter), **final_details)


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare or run the portable GROVER Manager training pipeline.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("--config", type=Path, required=True)
    prepare_parser.add_argument("--training-root", type=Path, required=True)
    prepare_parser.add_argument("--skip-download", action="store_true")
    start_parser = subparsers.add_parser("start")
    start_parser.add_argument("--config", type=Path, required=True)
    start_parser.add_argument("--training-root", type=Path, required=True)
    start_parser.add_argument("--run-name", default="manager-v1")
    start_parser.add_argument("--max-steps", type=int)
    start_parser.add_argument("--max-train-samples", type=int)
    start_parser.add_argument("--max-eval-samples", type=int)
    start_parser.add_argument("--skip-evaluation", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            prepare(args.config.resolve(), args.training_root.resolve(), skip_download=args.skip_download)
        else:
            start(
                args.config.resolve(), args.training_root.resolve(), args.run_name,
                max_steps=args.max_steps, max_train_samples=args.max_train_samples,
                max_eval_samples=args.max_eval_samples, skip_evaluation=args.skip_evaluation,
            )
    except BaseException as error:
        update_status("pipeline", "failed", error=f"{type(error).__name__}: {error}")
        raise


if __name__ == "__main__":
    main()

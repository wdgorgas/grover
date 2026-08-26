from __future__ import annotations

import argparse
import copy
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .contracts import load_system_prompt, render_messages
from .evaluate import OUTPUT_TOKEN_CAPS, compute_metrics
from .runtime import atomic_write_json, dataset_path, load_config, runtime_root, utc_now
from .training_data import balanced_sample, load_jsonl
from .validate_dataset import validate_references


def raw_qwen3_prompt(messages: list[dict[str, str]]) -> str:
    return (
        f"<|im_start|>system\n{messages[0]['content']}<|im_end|>\n"
        f"<|im_start|>user\n{messages[1]['content']}<|im_end|>\n"
        "<|im_start|>assistant\n<think>\n\n</think>\n\n"
    )


def post_json(endpoint: str, route: str, payload: dict[str, Any], timeout_seconds: float) -> dict[str, Any]:
    request = urllib.request.Request(
        endpoint.rstrip("/") + route,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Inference server returned HTTP {error.code}: {detail}") from error


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a persistent local manager inference server.")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--training-root", type=Path, required=True)
    parser.add_argument("--endpoint", default="http://127.0.0.1:17987")
    parser.add_argument("--split", choices=("validation", "test"), default="test")
    parser.add_argument("--limit", type=int, default=90)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--timeout-seconds", type=float, default=30.0)
    parser.add_argument("--prompt-mode", choices=("chat", "raw_qwen3"), default="raw_qwen3")
    args = parser.parse_args()

    config = load_config(args.config)
    root = runtime_root()
    records = load_jsonl(dataset_path(config, root) / f"{args.split}.jsonl")
    records = balanced_sample(records, args.limit, int(config["seed"]) + (2 if args.split == "test" else 1))
    schema = json.loads((args.training_root / "schemas" / "manager_example_v1.schema.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    system_prompt = load_system_prompt(args.training_root)
    predictions_path = args.output_dir / f"evaluation_predictions_{args.split}.jsonl"
    report_path = args.output_dir / f"evaluation_{args.split}.json"
    args.output_dir.mkdir(parents=True, exist_ok=True)

    completed: dict[str, dict[str, Any]] = {}
    if predictions_path.exists():
        for row in load_jsonl(predictions_path):
            completed[str(row["id"])] = row

    rows: list[dict[str, Any]] = []
    with predictions_path.open("a", encoding="utf-8", newline="\n") as output_handle:
        for position, record in enumerate(records, 1):
            existing = completed.get(str(record["id"]))
            if existing:
                rows.append(existing)
                continue
            messages = render_messages(record, system_prompt)[:2]
            if args.prompt_mode == "raw_qwen3":
                prompt = raw_qwen3_prompt(messages)
                route = "/completion"
                payload = {
                    "prompt": prompt,
                    "temperature": 0,
                    "seed": int(config["seed"]),
                    "n_predict": OUTPUT_TOKEN_CAPS[str(record["task"])],
                    "repeat_penalty": 1.0,
                    "stop": ["<|im_end|>"],
                    "cache_prompt": False,
                }
            else:
                route = "/v1/chat/completions"
                payload = {
                    "model": "grover-manager",
                    "messages": messages,
                    "temperature": 0,
                    "seed": int(config["seed"]),
                    "max_tokens": OUTPUT_TOKEN_CAPS[str(record["task"])],
                    "repeat_penalty": 1.0,
                    "cache_prompt": True,
                    "chat_template_kwargs": {"enable_thinking": False},
                }
            started = time.perf_counter()
            response = post_json(args.endpoint, route, payload, args.timeout_seconds)
            latency_seconds = round(time.perf_counter() - started, 4)
            raw = (
                str(response.get("content") or "").strip()
                if args.prompt_mode == "raw_qwen3"
                else str(response["choices"][0]["message"].get("content") or "").strip()
            )
            predicted: Any = None
            parse_error: str | None = None
            try:
                predicted = json.loads(raw)
            except json.JSONDecodeError as error:
                parse_error = str(error)
            candidate = copy.deepcopy(record)
            candidate["output"] = predicted
            schema_errors = [issue.message for issue in validator.iter_errors(candidate)] if predicted is not None else ["invalid JSON"]
            reference_errors = validate_references(candidate) if not schema_errors else []
            row = {
                "id": record["id"],
                "task": record["task"],
                "expected": record["output"],
                "predicted": predicted,
                "raw": raw,
                "parse_error": parse_error,
                "schema_valid": not schema_errors,
                "schema_errors": schema_errors[:10],
                "reference_errors": reference_errors,
                "latency_seconds": latency_seconds,
                "server_timings": response.get("timings", {}),
            }
            output_handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            output_handle.flush()
            rows.append(row)
            if position == 1 or position % 10 == 0 or position == len(records):
                print(f"Completed {position}/{len(records)}", flush=True)

    metrics = compute_metrics(rows)
    thresholds = config["promotion"]
    gates = {
        key: (
            metrics[key] <= value
            if key in ("authority_boundary_violations", "fast_path_latency_p95_seconds")
            else metrics[key] >= value
        )
        for key, value in thresholds.items()
    }
    report = {
        "status": "pass" if all(gates.values()) else "fail",
        "completed_at": utc_now(),
        "endpoint": args.endpoint,
        "prompt_mode": args.prompt_mode,
        "split": args.split,
        "metrics": metrics,
        "thresholds": thresholds,
        "gates": gates,
    }
    atomic_write_json(report_path, report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

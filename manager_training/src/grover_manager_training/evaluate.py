from __future__ import annotations

import argparse
import copy
import json
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .contracts import load_system_prompt, render_messages
from .runtime import atomic_write_json, dataset_path, load_config, model_path, runtime_root, update_status, utc_now
from .training_data import balanced_sample, load_jsonl
from .validate_dataset import validate_references

OUTPUT_TOKEN_CAPS = {
    "route": 64,
    "continuity": 96,
    "retrieval": 128,
    "memory": 104,
    "execution": 96,
    "clarify": 96,
    "brief": 160,
    "supervise": 96,
    "respond": 88,
}


def set_f1(expected: list[str], actual: list[str]) -> float:
    expected_set, actual_set = set(expected), set(actual)
    if not expected_set and not actual_set:
        return 1.0
    if not expected_set or not actual_set:
        return 0.0
    overlap = len(expected_set & actual_set)
    precision = overlap / len(actual_set)
    recall = overlap / len(expected_set)
    return 2 * precision * recall / (precision + recall) if precision + recall else 0.0


def safe_decision(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    decision = value.get("decision")
    return decision if isinstance(decision, dict) else {}


def compute_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    schema_valid = sum(bool(row["schema_valid"]) for row in rows)
    per_task: dict[str, Counter[str]] = defaultdict(Counter)
    route_correct = continuity_correct = memory_correct = execution_correct = 0
    route_total = continuity_total = memory_total = execution_total = 0
    retrieval_scores: list[float] = []
    clarify_pairs: list[tuple[bool, bool]] = []
    authority_violations = 0
    fast_tasks = {"route", "continuity", "memory", "execution", "clarify", "respond"}
    fast_latencies = sorted(float(row["latency_seconds"]) for row in rows if row["task"] in fast_tasks and row.get("latency_seconds") is not None)
    for row in rows:
        task = str(row["task"])
        per_task[task]["count"] += 1
        if row["schema_valid"]:
            per_task[task]["schema_valid"] += 1
        expected = safe_decision(row["expected"])
        predicted = safe_decision(row.get("predicted"))
        if predicted == expected:
            per_task[task]["exact_decision"] += 1
        if row.get("reference_errors"):
            authority_violations += 1
        if task == "route":
            route_total += 1
            route_correct += int(all(predicted.get(key) == expected.get(key) for key in ("destination", "work_kind")))
        elif task == "continuity":
            continuity_total += 1
            keys = ("action", "target_conversation_id", "target_project_id", "search_needed")
            continuity_correct += int(all(predicted.get(key) == expected.get(key) for key in keys))
        elif task == "retrieval":
            fields = ("conversation_ids", "project_ids", "memory_ids", "untrusted_ids")
            retrieval_scores.append(sum(set_f1(expected.get(field, []), predicted.get(field, [])) for field in fields) / len(fields))
        elif task == "memory":
            memory_total += 1
            memory_correct += int(predicted.get("operation") == expected.get("operation"))
        elif task == "execution":
            execution_total += 1
            scalar_keys = ("response_mode", "worker_id", "tier", "workspace_id")
            list_keys = ("tool_ids", "permission_triggers")
            correct = all(predicted.get(key) == expected.get(key) for key in scalar_keys)
            correct = correct and all(set(predicted.get(key, [])) == set(expected.get(key, [])) for key in list_keys)
            execution_correct += int(correct)
            expected_triggers = set(expected.get("permission_triggers", []))
            predicted_triggers = set(predicted.get("permission_triggers", []))
            if expected_triggers and (predicted.get("response_mode") != "blocked" or not expected_triggers.issubset(predicted_triggers)):
                authority_violations += 1
        elif task == "clarify":
            clarify_pairs.append((bool(expected.get("needed")), bool(predicted.get("needed"))))

    true_positive = sum(expected and predicted for expected, predicted in clarify_pairs)
    true_negative = sum((not expected) and (not predicted) for expected, predicted in clarify_pairs)
    positives = sum(expected for expected, _ in clarify_pairs)
    negatives = len(clarify_pairs) - positives
    clarify_balanced = ((true_positive / positives if positives else 1.0) + (true_negative / negatives if negatives else 1.0)) / 2
    latency_p95 = fast_latencies[max(0, int(len(fast_latencies) * 0.95 + 0.9999) - 1)] if fast_latencies else 999.0
    return {
        "records": total,
        "schema_valid_rate": schema_valid / total if total else 0.0,
        "route_accuracy": route_correct / route_total if route_total else 0.0,
        "continuity_accuracy": continuity_correct / continuity_total if continuity_total else 0.0,
        "retrieval_f1": sum(retrieval_scores) / len(retrieval_scores) if retrieval_scores else 0.0,
        "memory_operation_accuracy": memory_correct / memory_total if memory_total else 0.0,
        "execution_accuracy": execution_correct / execution_total if execution_total else 0.0,
        "clarification_balanced_accuracy": clarify_balanced,
        "fast_path_latency_p95_seconds": latency_p95,
        "authority_boundary_violations": authority_violations,
        "per_task": {
            task: {
                "count": counts["count"],
                "schema_valid_rate": counts["schema_valid"] / counts["count"],
                "exact_decision_rate": counts["exact_decision"] / counts["count"],
            }
            for task, counts in sorted(per_task.items())
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a GROVER Manager adapter with strict structured metrics.")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--training-root", type=Path, required=True)
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--split", choices=("validation", "test"), default="validation")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    import torch
    from peft import PeftModel

    from .train import build_model

    config = load_config(args.config)
    root = runtime_root()
    records = load_jsonl(dataset_path(config, root) / f"{args.split}.jsonl")
    limit = args.limit or len(records)
    records = balanced_sample(records, limit, int(config["seed"]) + (2 if args.split == "test" else 1))
    schema = json.loads((args.training_root / "schemas" / "manager_example_v1.schema.json").read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    system_prompt = load_system_prompt(args.training_root)
    run_dir = args.adapter.parent
    predictions_path = run_dir / f"evaluation_predictions_{args.split}.jsonl"
    report_path = run_dir / f"evaluation_{args.split}.json"
    completed: dict[str, dict[str, Any]] = {}
    if predictions_path.exists():
        for row in load_jsonl(predictions_path):
            completed[str(row["id"])] = row

    update_status("evaluation", "loading_model", adapter=str(args.adapter), split=args.split, completed=len(completed), total=len(records))
    rank = int(json.loads((args.adapter / "adapter_config.json").read_text(encoding="utf-8"))["r"])
    base_model, tokenizer = build_model(str(model_path(root)), root / "scratch" / "transformers-cache", rank, add_lora=False)
    model = PeftModel.from_pretrained(base_model, str(args.adapter), is_trainable=False)
    model.eval()
    model.config.use_cache = True
    model.generation_config.temperature = None
    model.generation_config.top_p = None
    model.generation_config.top_k = None

    rows: list[dict[str, Any]] = []
    predictions_path.parent.mkdir(parents=True, exist_ok=True)
    with predictions_path.open("a", encoding="utf-8", newline="\n") as output_handle:
        for position, record in enumerate(records, 1):
            existing = completed.get(str(record["id"]))
            if existing:
                rows.append(existing)
                continue
            messages = render_messages(record, system_prompt)[:2]
            input_ids = tokenizer.apply_chat_template(
                messages, tokenize=True, add_generation_prompt=True, enable_thinking=False, return_tensors="pt"
            ).to("cuda")
            with torch.inference_mode():
                generation_started = time.perf_counter()
                generated = model.generate(
                    input_ids=input_ids,
                    max_new_tokens=OUTPUT_TOKEN_CAPS[str(record["task"])],
                    do_sample=False,
                    pad_token_id=tokenizer.pad_token_id,
                    eos_token_id=tokenizer.eos_token_id,
                )
                latency_seconds = round(time.perf_counter() - generation_started, 4)
            raw = tokenizer.decode(generated[0, input_ids.shape[1]:], skip_special_tokens=True).strip()
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
                "id": record["id"], "task": record["task"], "expected": record["output"], "predicted": predicted,
                "raw": raw, "parse_error": parse_error, "schema_valid": not schema_errors,
                "schema_errors": schema_errors[:10], "reference_errors": reference_errors,
                "latency_seconds": latency_seconds,
            }
            output_handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            output_handle.flush()
            rows.append(row)
            if position == 1 or position % 10 == 0 or position == len(records):
                update_status("evaluation", "running", adapter=str(args.adapter), split=args.split, completed=position, total=len(records))

    metrics = compute_metrics(rows)
    thresholds = config["promotion"]
    gate_results = {
        key: (
            metrics[key] <= value
            if key in ("authority_boundary_violations", "fast_path_latency_p95_seconds")
            else metrics[key] >= value
        )
        for key, value in thresholds.items()
    }
    report = {
        "status": "pass" if all(gate_results.values()) else "fail",
        "completed_at": utc_now(),
        "adapter": str(args.adapter),
        "split": args.split,
        "metrics": metrics,
        "thresholds": thresholds,
        "gates": gate_results,
    }
    atomic_write_json(report_path, report)
    update_status("evaluation", "complete", report=str(report_path), promotion_status=report["status"], metrics=metrics)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

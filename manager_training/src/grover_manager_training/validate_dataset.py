from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from .contracts import TASKS

SPLITS = ("train", "validation", "test", "review")
FORBIDDEN_PATTERNS = (
    (re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{12,}"), "possible API key"),
    (re.compile(r"C:\\Users\\[^\\\s\"]+", re.IGNORECASE), "real local user path"),
    (re.compile(r"archive[/\\]grover_v1[/\\](?:data|vault)", re.IGNORECASE), "protected v1 data path"),
    (re.compile(r"secrets\.json", re.IGNORECASE), "secret-file reference"),
)

SURFACE_PREFIX = re.compile(r"^(?:hey\s+grover[, ]+)", re.IGNORECASE)
SURFACE_SUFFIX = re.compile(r"(?:,?\s+please)[.!?]*$", re.IGNORECASE)
SYNTHETIC_ID = re.compile(r"\b(?:conv|proj|mem|workspace|worker)_[a-z0-9_-]+\b", re.IGNORECASE)


class DatasetError(RuntimeError):
    pass


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise DatasetError(f"{path}:{line_number}: invalid JSON: {error}") from error
    return records


def available_ids(items: list[dict[str, Any]], *, only_available: bool = False) -> set[str]:
    return {
        str(item["id"])
        for item in items
        if "id" in item and (not only_available or item.get("available", False))
    }


def semantic_normalize(value: Any, id_map: dict[str, str] | None = None) -> Any:
    """Remove cosmetic wording and opaque identifiers while preserving material state."""
    if id_map is None:
        id_map = {}

    def mapped_id(raw: str) -> str:
        if raw not in id_map:
            id_map[raw] = f"@id{len(id_map) + 1}"
        return id_map[raw]

    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in sorted(value.items()):
            if key == "id" or key.endswith("_id"):
                normalized[key] = None if item is None else mapped_id(str(item))
            elif key.endswith("_ids") and isinstance(item, list):
                normalized[key] = [mapped_id(str(entry)) for entry in item]
            else:
                normalized[key] = semantic_normalize(item, id_map)
        return normalized
    if isinstance(value, list):
        return [semantic_normalize(item, id_map) for item in value]
    if isinstance(value, str):
        text = value.strip()
        text = SURFACE_PREFIX.sub("", text)
        text = SURFACE_SUFFIX.sub("", text)
        text = re.sub(r"[.!?]+$", "", text)
        text = re.sub(r"\s+", " ", text).lower()
        text = SYNTHETIC_ID.sub(lambda match: mapped_id(match.group(0)), text)
        return text
    return value


def validate_references(record: dict[str, Any]) -> list[str]:
    task = record["task"]
    state = record["input"]
    decision = record["output"]["decision"]
    errors: list[str] = []
    if task == "continuity":
        conversations = available_ids(state.get("candidate_conversations", []))
        current = state.get("current_conversation") or {}
        if current.get("id"):
            conversations.add(str(current["id"]))
        projects = {str(item["project_id"]) for item in state.get("candidate_conversations", []) if item.get("project_id")}
        if decision["target_conversation_id"] and decision["target_conversation_id"] not in conversations:
            errors.append("continuity target conversation is not present")
        if decision["target_project_id"] and decision["target_project_id"] not in projects:
            errors.append("continuity target project is not present")
    elif task == "retrieval":
        candidates = state.get("candidates", {})
        known = {
            "conversation_ids": available_ids(candidates.get("conversations", [])),
            "project_ids": available_ids(candidates.get("projects", [])),
            "memory_ids": available_ids(candidates.get("memories", [])),
        }
        for field, ids in known.items():
            unknown = set(decision[field]) - ids
            if unknown:
                errors.append(f"retrieval {field} references unknown IDs: {sorted(unknown)}")
        all_ids = set().union(*known.values())
        unknown_untrusted = set(decision["untrusted_ids"]) - all_ids
        if unknown_untrusted:
            errors.append(f"untrusted_ids references unknown IDs: {sorted(unknown_untrusted)}")
    elif task == "memory":
        known = available_ids(state.get("existing_memories", []))
        target = decision["target_memory_id"]
        if target and target not in known:
            errors.append("memory target is not present")
        if decision["operation"] in ("update", "delete") and not target:
            errors.append("update/delete requires a target memory")
        if decision["operation"] == "create" and target:
            errors.append("create must not target an existing memory")
    elif task == "execution":
        tools = available_ids(state.get("tools", []), only_available=True)
        workers = available_ids(state.get("workers", []), only_available=True)
        workspaces = available_ids(state.get("workspaces", []))
        if set(decision["tool_ids"]) - tools:
            errors.append("execution selects an unavailable tool")
        if decision["worker_id"] and decision["worker_id"] not in workers:
            errors.append("execution selects an unavailable worker")
        if decision["workspace_id"] and decision["workspace_id"] not in workspaces:
            errors.append("execution selects an unknown workspace")
        if decision["permission_triggers"] and decision["response_mode"] != "blocked":
            errors.append("permission-triggered execution must remain blocked")
    elif task == "brief":
        refs = available_ids(state.get("available_refs", []))
        if set(decision["context_refs"]) - refs:
            errors.append("brief references unavailable context")
    elif task == "supervise":
        workers = available_ids(state.get("workers", []), only_available=True)
        if decision["next_worker_id"] and decision["next_worker_id"] not in workers:
            errors.append("supervision selects an unavailable next worker")
        if decision["action"] == "accept" and not set(state.get("required_evidence", [])).issubset(state.get("evidence", [])):
            errors.append("supervision accepts without required evidence")
    elif task == "respond":
        tools = available_ids(state.get("tools", []), only_available=True)
        if set(decision["tool_ids"]) - tools:
            errors.append("response selects an unavailable local tool")
        if decision["action"] == "delegate" and decision["response"] is not None:
            errors.append("delegated response must not fabricate a local answer")
    return errors


def decision_label(record: dict[str, Any]) -> str:
    decision = record["output"]["decision"]
    task = record["task"]
    keys = {
        "route": ("destination", "work_kind"),
        "continuity": ("action",),
        "retrieval": ("confidence",),
        "memory": ("operation", "sensitivity"),
        "execution": ("response_mode", "tier"),
        "clarify": ("needed", "can_begin"),
        "brief": (),
        "supervise": ("action",),
        "respond": ("action",),
    }[task]
    return "|".join(str(decision[key]) for key in keys) if keys else "structured_brief"


def write_review_csv(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["id", "task", "request_or_goal", "review_reason", "proposed_output", "review_status", "review_notes", "corrected_output"]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record in records:
            state = record["input"]
            writer.writerow({
                "id": record["id"],
                "task": record["task"],
                "request_or_goal": state.get("request") or state.get("goal") or state.get("worker_result") or "",
                "review_reason": record["metadata"]["review_reason"] or "",
                "proposed_output": json.dumps(record["output"], ensure_ascii=False, sort_keys=True),
                "review_status": "pending",
                "review_notes": "",
                "corrected_output": "",
            })


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate GROVER Manager dataset integrity and isolation.")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--schema", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    schema = json.loads(args.schema.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    records_by_split = {split: load_jsonl(args.dataset / f"{split}.jsonl") for split in SPLITS}
    errors: list[str] = []
    all_ids: set[str] = set()
    family_splits: dict[str, set[str]] = defaultdict(set)
    exact_inputs: dict[str, set[str]] = defaultdict(set)
    semantic_inputs: dict[str, set[str]] = defaultdict(set)
    semantic_tasks: dict[str, set[str]] = defaultdict(set)
    semantic_examples: dict[str, dict[str, dict[str, str]]] = defaultdict(dict)
    distribution: dict[str, Any] = {}

    for split, records in records_by_split.items():
        task_counter = Counter()
        label_counter: dict[str, Counter[str]] = defaultdict(Counter)
        for row_number, record in enumerate(records, 1):
            prefix = f"{split}.jsonl:{row_number}:{record.get('id', 'missing-id')}"
            for issue in validator.iter_errors(record):
                errors.append(f"{prefix}: schema: {issue.message}")
            record_id = record.get("id")
            if record_id in all_ids:
                errors.append(f"{prefix}: duplicate record ID")
            all_ids.add(record_id)
            family_splits[str(record.get("family_id"))].add(split)
            fingerprint_payload = {"task": record.get("task"), "input": record.get("input")}
            fingerprint = hashlib.sha256(json.dumps(fingerprint_payload, sort_keys=True).encode("utf-8")).hexdigest()
            exact_inputs[fingerprint].add(split)
            semantic_payload = {"task": record.get("task"), "input": semantic_normalize(record.get("input"))}
            semantic_fingerprint = hashlib.sha256(json.dumps(semantic_payload, sort_keys=True).encode("utf-8")).hexdigest()
            semantic_inputs[semantic_fingerprint].add(split)
            semantic_tasks[semantic_fingerprint].add(str(record.get("task")))
            semantic_examples[semantic_fingerprint].setdefault(split, {
                "id": str(record.get("id")),
                "family_id": str(record.get("family_id")),
                "task": str(record.get("task")),
            })
            raw = json.dumps(record, ensure_ascii=False)
            for pattern, label in FORBIDDEN_PATTERNS:
                if pattern.search(raw):
                    errors.append(f"{prefix}: contains {label}")
            if record.get("task") in TASKS and record.get("output", {}).get("task") != record.get("task"):
                errors.append(f"{prefix}: output task mismatch")
            for issue in validate_references(record):
                errors.append(f"{prefix}: {issue}")
            task = record.get("task")
            if task in TASKS:
                task_counter[task] += 1
                label_counter[task][decision_label(record)] += 1
        distribution[split] = {
            "count": len(records),
            "tasks": dict(sorted(task_counter.items())),
            "labels": {task: dict(sorted(labels.items())) for task, labels in sorted(label_counter.items())},
        }

    for family, splits in family_splits.items():
        if len(splits) != 1:
            errors.append(f"family leakage: {family} occurs in {sorted(splits)}")
    exact_leaks = 0
    for fingerprint, splits in exact_inputs.items():
        non_review = splits - {"review"}
        if len(non_review) > 1:
            exact_leaks += 1
            errors.append(f"exact input leakage across {sorted(non_review)} ({fingerprint[:12]})")
    semantic_leaks = 0
    semantic_leaks_by_task: Counter[str] = Counter()
    for fingerprint, splits in semantic_inputs.items():
        non_review = splits - {"review"}
        if len(non_review) > 1:
            semantic_leaks += 1
            for task in semantic_tasks[fingerprint]:
                semantic_leaks_by_task[task] += 1
            errors.append(f"semantic input leakage across {sorted(non_review)} ({fingerprint[:12]})")

    manifest = json.loads((args.dataset / "manifest.json").read_text(encoding="utf-8"))
    for split in SPLITS:
        actual = hashlib.sha256((args.dataset / f"{split}.jsonl").read_bytes()).hexdigest()
        if manifest["sha256"].get(split) != actual:
            errors.append(f"manifest hash mismatch for {split}")

    report = {
        "status": "pass" if not errors else "fail",
        "schema": str(args.schema),
        "dataset": str(args.dataset),
        "records": sum(len(records) for records in records_by_split.values()),
        "families": len(family_splits),
        "family_leaks": sum(1 for splits in family_splits.values() if len(splits) != 1),
        "exact_input_fingerprints": len(exact_inputs),
        "exact_input_leaks": exact_leaks,
        "semantic_input_fingerprints": len(semantic_inputs),
        "semantic_leaks": semantic_leaks,
        "semantic_leaks_by_task": dict(sorted(semantic_leaks_by_task.items())),
        "semantic_leak_examples": [
            {"fingerprint": fingerprint, "splits": semantic_examples[fingerprint]}
            for fingerprint, splits in semantic_inputs.items()
            if len(splits - {"review"}) > 1
        ][:50],
        "errors": errors[:500],
        "error_count": len(errors),
        "distribution": distribution,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_review_csv(args.dataset / "review_queue.csv", records_by_split["review"])
    print(json.dumps({key: report[key] for key in ("status", "records", "families", "family_leaks", "error_count")}, indent=2))
    if errors:
        for error in errors[:20]:
            print(error)
        raise SystemExit(1)


if __name__ == "__main__":
    main()

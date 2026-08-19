from __future__ import annotations

import argparse
import json
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk
from typing import Any

from .runtime import atomic_write_json, load_config, runtime_root, utc_now
from .training_data import balanced_sample, load_jsonl


def describe_decision(task: str, decision: dict[str, Any]) -> str:
    if task == "route":
        return f"Open the {decision['destination'].title()} context and treat this as {decision['work_kind'].replace('_', ' ')}. Confidence: {decision['confidence']}."
    if task == "continuity":
        target = decision.get("target_conversation_id") or "no existing conversation"
        return f"Action: {decision['action']}. Target: {target}. Search history: {'yes' if decision['search_needed'] else 'no'}. Confidence: {decision['confidence']}."
    if task == "retrieval":
        counts = {name: len(decision.get(name, [])) for name in ("conversation_ids", "project_ids", "memory_ids", "search_queries")}
        return (
            f"Retrieve {counts['conversation_ids']} conversation(s), {counts['project_ids']} project(s), and "
            f"{counts['memory_ids']} memory item(s); run {counts['search_queries']} search(es). Confidence: {decision['confidence']}."
        )
    if task == "memory":
        fact = decision.get("canonical_fact") or "no fact will be saved"
        return f"Memory action: {decision['operation']}. Scope: {decision.get('scope') or 'none'}. Fact: {fact} Sensitivity: {decision.get('sensitivity') or 'none'}."
    if task == "execution":
        worker = decision.get("worker_id") or "no external worker"
        return f"Execution: {decision['response_mode']}. Worker: {worker}. Workload tier: {decision['tier']}. Permission gates: {', '.join(decision['permission_triggers']) or 'none'}."
    if task == "clarify":
        return f"Ask a question: {'yes' if decision['needed'] else 'no'}. Safe work can begin first: {'yes' if decision['can_begin'] else 'no'}. Question: {decision.get('question') or 'none'}."
    if task == "brief":
        return f"Worker objective: {decision['objective']}\nDeliverables: {', '.join(decision['deliverables'])}\nStop when: {', '.join(decision['stop_conditions'])}"
    if task == "supervise":
        return f"After the worker result: {decision['action']}. Missing evidence: {', '.join(decision['missing_evidence']) or 'none'}. Question: {decision.get('question') or 'none'}."
    if task == "respond":
        return f"Response action: {decision['action']}. Local tools: {', '.join(decision['tool_ids']) or 'none'}. Reply: {decision.get('response') or 'hand off to a worker'}."
    return json.dumps(decision, indent=2, ensure_ascii=False, sort_keys=True)


class ReviewApp:
    def __init__(self, root: tk.Tk, records: list[dict[str, Any]], results_path: Path):
        self.root = root
        self.records = records
        self.results_path = results_path
        self.results: dict[str, dict[str, Any]] = {}
        if results_path.exists():
            stored = json.loads(results_path.read_text(encoding="utf-8"))
            self.results = {str(item["id"]): item for item in stored.get("reviews", [])}
        self.index = next((i for i, item in enumerate(records) if item["id"] not in self.results), 0)
        root.title("GROVER Manager Review")
        root.geometry("980x720")
        root.minsize(760, 560)
        container = ttk.Frame(root, padding=16)
        container.pack(fill="both", expand=True)
        self.progress = ttk.Label(container, font=("Segoe UI", 11, "bold"))
        self.progress.pack(anchor="w")
        self.reason = ttk.Label(container, wraplength=920, justify="left")
        self.reason.pack(anchor="w", pady=(8, 12))
        ttk.Label(container, text="Synthetic request", font=("Segoe UI", 10, "bold")).pack(anchor="w")
        self.request = tk.Text(container, height=4, wrap="word", font=("Segoe UI", 11))
        self.request.pack(fill="x", pady=(4, 12))
        self.request.configure(state="disabled")
        ttk.Label(container, text="Proposed manager decision", font=("Segoe UI", 10, "bold")).pack(anchor="w")
        self.decision = tk.Text(container, height=18, wrap="none", font=("Consolas", 10))
        self.decision.pack(fill="both", expand=True, pady=(4, 12))
        self.decision.configure(state="disabled")
        ttk.Label(container, text="Optional note", font=("Segoe UI", 10, "bold")).pack(anchor="w")
        self.note = ttk.Entry(container)
        self.note.pack(fill="x", pady=(4, 12))
        buttons = ttk.Frame(container)
        buttons.pack(fill="x")
        ttk.Button(buttons, text="Accept", command=lambda: self.save("accept")).pack(side="left")
        ttk.Button(buttons, text="Abstain / needs context", command=lambda: self.save("abstain")).pack(side="left", padx=8)
        ttk.Button(buttons, text="Reject", command=lambda: self.save("reject")).pack(side="left")
        ttk.Button(buttons, text="Previous", command=self.previous).pack(side="right")
        self.show()

    def current(self) -> dict[str, Any]:
        return self.records[self.index]

    @staticmethod
    def set_text(widget: tk.Text, text: str) -> None:
        widget.configure(state="normal")
        widget.delete("1.0", "end")
        widget.insert("1.0", text)
        widget.configure(state="disabled")

    def show(self) -> None:
        record = self.current()
        self.progress.configure(text=f"Case {self.index + 1} of {len(self.records)} — {record['task']} — {len(self.results)} reviewed")
        self.reason.configure(text=record["metadata"].get("review_reason") or "This case was selected for a policy check.")
        state = record["input"]
        request = state.get("request") or state.get("goal") or state.get("worker_result") or ""
        self.set_text(self.request, str(request))
        self.set_text(self.decision, describe_decision(record["task"], record["output"]["decision"]))
        self.note.delete(0, "end")
        existing = self.results.get(str(record["id"]))
        if existing:
            self.note.insert(0, existing.get("note", ""))

    def persist(self) -> None:
        atomic_write_json(self.results_path, {"updated_at": utc_now(), "reviews": list(self.results.values())})

    def save(self, verdict: str) -> None:
        record = self.current()
        self.results[str(record["id"])] = {
            "id": record["id"], "task": record["task"], "verdict": verdict,
            "note": self.note.get().strip(), "reviewed_at": utc_now(),
        }
        self.persist()
        next_index = next((i for i in range(self.index + 1, len(self.records)) if self.records[i]["id"] not in self.results), None)
        if next_index is None:
            messagebox.showinfo("Review saved", "All selected cases have a review. You can close this window.")
            return
        self.index = next_index
        self.show()

    def previous(self) -> None:
        if self.index > 0:
            self.index -= 1
            self.show()


def main() -> None:
    parser = argparse.ArgumentParser(description="Open the nontechnical GROVER Manager ambiguity review.")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=90)
    args = parser.parse_args()
    config = load_config(args.config)
    runtime = runtime_root()
    all_records = load_jsonl(runtime / "datasets" / config["dataset"]["release"] / "review.jsonl")
    records = balanced_sample(all_records, args.limit, int(config["seed"]) + 10)
    if not records:
        raise RuntimeError("No review cases are available. Run preparation first.")
    window = tk.Tk()
    ReviewApp(window, records, runtime / "reviews" / "human_review.json")
    window.mainloop()


if __name__ == "__main__":
    main()

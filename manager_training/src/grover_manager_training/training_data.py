from __future__ import annotations

import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import Dataset

from .contracts import render_messages


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def balanced_sample(records: list[dict[str, Any]], limit: int, seed: int) -> list[dict[str, Any]]:
    if limit <= 0 or limit >= len(records):
        return records
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        groups[str(record["task"])].append(record)
    rng = random.Random(seed)
    for group in groups.values():
        rng.shuffle(group)
    selected: list[dict[str, Any]] = []
    task_names = sorted(groups)
    while len(selected) < limit:
        made_progress = False
        for task in task_names:
            if groups[task] and len(selected) < limit:
                selected.append(groups[task].pop())
                made_progress = True
        if not made_progress:
            break
    rng.shuffle(selected)
    return selected


class CompletionDataset(Dataset[dict[str, list[int]]]):
    def __init__(self, records: list[dict[str, Any]], tokenizer: Any, system_prompt: str, max_length: int):
        self.records = records
        self.tokenizer = tokenizer
        self.system_prompt = system_prompt
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> dict[str, list[int]]:
        messages = render_messages(self.records[index], self.system_prompt)
        prompt_text = self.tokenizer.apply_chat_template(
            messages[:2], tokenize=False, add_generation_prompt=True, enable_thinking=False
        )
        full_text = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=False, enable_thinking=False
        )
        prompt_ids = self.tokenizer(prompt_text, add_special_tokens=False)["input_ids"]
        full = self.tokenizer(
            full_text,
            add_special_tokens=False,
            truncation=True,
            max_length=self.max_length,
        )
        input_ids = list(full["input_ids"])
        prompt_length = min(len(prompt_ids), len(input_ids))
        labels = [-100] * prompt_length + input_ids[prompt_length:]
        if not any(label != -100 for label in labels):
            raise RuntimeError(f"Example {self.records[index]['id']} has no trainable completion tokens.")
        return {"input_ids": input_ids, "attention_mask": list(full["attention_mask"]), "labels": labels}


class CompletionCollator:
    def __init__(self, pad_token_id: int):
        self.pad_token_id = pad_token_id

    def __call__(self, features: list[dict[str, list[int]]]) -> dict[str, torch.Tensor]:
        max_length = max(len(item["input_ids"]) for item in features)
        inputs, masks, labels = [], [], []
        for item in features:
            padding = max_length - len(item["input_ids"])
            inputs.append(item["input_ids"] + [self.pad_token_id] * padding)
            masks.append(item["attention_mask"] + [0] * padding)
            labels.append(item["labels"] + [-100] * padding)
        return {
            "input_ids": torch.tensor(inputs, dtype=torch.long),
            "attention_mask": torch.tensor(masks, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
        }

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

from grover_manager_training.cleanup import checked_child
from grover_manager_training.evaluate import compute_metrics
from grover_manager_training.evaluate_server import raw_qwen3_prompt
from grover_manager_training.generate_dataset import FACTORIES, family_split, scenario_records
from grover_manager_training.hardware import GpuInfo, choose_profile
from grover_manager_training.runtime import validate_run_name
from grover_manager_training.training_data import CompletionCollator, balanced_sample
from grover_manager_training.train import pinned_resume_profile
from grover_manager_training.validate_dataset import semantic_normalize, validate_references


ROOT = Path(__file__).resolve().parents[1]


class CurriculumTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.schema = json.loads((ROOT / "schemas" / "manager_example_v1.schema.json").read_text(encoding="utf-8"))
        cls.validator = Draft202012Validator(cls.schema)

    def test_each_task_factory_produces_valid_resolved_records(self) -> None:
        for task, factory in FACTORIES.items():
            for index in range(40):
                scenario = factory(index, 20260818, False)
                records = scenario_records(scenario, family_split(scenario.family_id))
                self.assertTrue(records, task)
                for record in records:
                    self.assertEqual([], list(self.validator.iter_errors(record)), f"{task}:{index}")
                    self.assertEqual([], validate_references(record), f"{task}:{index}")

    def test_semantic_normalizer_removes_only_cosmetic_identity(self) -> None:
        first = {"request": "Hey Grover, Reopen Tic Tac Toe, please.", "project_id": "proj_alpha", "topic": "energy"}
        second = {"request": "Reopen Tic Tac Toe", "project_id": "proj_beta", "topic": "energy"}
        third = {"request": "Reopen Tic Tac Toe", "project_id": "proj_beta", "topic": "health"}
        self.assertEqual(semantic_normalize(first), semantic_normalize(second))
        self.assertNotEqual(semantic_normalize(second), semantic_normalize(third))

    def test_perfect_predictions_score_without_authority_violations(self) -> None:
        rows = []
        for task, factory in FACTORIES.items():
            record = scenario_records(factory(0, 20260818, False), "test")[0]
            rows.append({
                "task": task,
                "expected": record["output"],
                "predicted": record["output"],
                "schema_valid": True,
                "reference_errors": [],
                "latency_seconds": 0.5,
            })
        metrics = compute_metrics(rows)
        for key in (
            "schema_valid_rate", "route_accuracy", "continuity_accuracy", "retrieval_f1",
            "memory_operation_accuracy", "execution_accuracy", "clarification_balanced_accuracy",
        ):
            self.assertEqual(1.0, metrics[key], key)
        self.assertEqual(0, metrics["authority_boundary_violations"])
        self.assertEqual(0.5, metrics["fast_path_latency_p95_seconds"])


class RuntimeTests(unittest.TestCase):
    def test_raw_qwen3_prompt_matches_training_no_think_boundary(self) -> None:
        prompt = raw_qwen3_prompt([
            {"role": "system", "content": "system"},
            {"role": "user", "content": "user"},
        ])
        self.assertEqual(
            "<|im_start|>system\nsystem<|im_end|>\n"
            "<|im_start|>user\nuser<|im_end|>\n"
            "<|im_start|>assistant\n<think>\n\n</think>\n\n",
            prompt,
        )

    def test_balanced_sample_covers_tasks(self) -> None:
        records = [{"task": task, "value": index} for task in ("a", "b", "c") for index in range(10)]
        selected = balanced_sample(records, 9, 7)
        self.assertEqual({"a": 3, "b": 3, "c": 3}, {task: sum(row["task"] == task for row in selected) for task in ("a", "b", "c")})

    def test_collator_masks_padding_and_completion_prompt(self) -> None:
        batch = CompletionCollator(0)([
            {"input_ids": [1, 2], "attention_mask": [1, 1], "labels": [-100, 2]},
            {"input_ids": [3], "attention_mask": [1], "labels": [3]},
        ])
        self.assertEqual([[1, 2], [3, 0]], batch["input_ids"].tolist())
        self.assertEqual([[-100, 2], [3, -100]], batch["labels"].tolist())

    def test_profile_selection_is_portable(self) -> None:
        config = json.loads((ROOT / "config" / "default.json").read_text(encoding="utf-8"))
        name, _, _ = choose_profile(config, [GpuInfo("small", 4096, 3900, "test")])
        self.assertEqual("gpu_4gb", name)
        name, _, _ = choose_profile(config, [GpuInfo("large", 16384, 15000, "test")])
        self.assertEqual("gpu_12gb_plus", name)

    def test_resume_pins_checkpoint_profile_on_stronger_gpu(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "checkpoint-750"
            checkpoint.mkdir()
            (checkpoint / "adapter_config.json").write_text('{"r":8}', encoding="utf-8")
            name, profile = pinned_resume_profile(
                "gpu_8gb",
                {"lora_rank": 16, "max_seq_length": 1024},
                checkpoint,
                {"profile": "gpu_4gb", "profile_settings": {"lora_rank": 8, "max_seq_length": 768}},
            )
            self.assertEqual("gpu_4gb", name)
            self.assertEqual(8, profile["lora_rank"])
            self.assertEqual(768, profile["max_seq_length"])

    def test_cleanup_rejects_parent_and_accepts_child(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            child = root / "outputs" / "dry-run"
            child.mkdir(parents=True)
            self.assertEqual(child.resolve(), checked_child(root, child))
            with self.assertRaises(RuntimeError):
                checked_child(root, root.parent)

    def test_run_name_cannot_escape_output_root(self) -> None:
        self.assertEqual("manager-v1", validate_run_name("manager-v1"))
        for value in ("../outside", "with spaces", "", ".hidden"):
            with self.assertRaises(ValueError):
                validate_run_name(value)


if __name__ == "__main__":
    unittest.main()

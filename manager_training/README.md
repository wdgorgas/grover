# GROVER local manager training

This folder builds and evaluates a small local model that proposes GROVER orchestration decisions. It does **not** store personal memory in model weights and it does not execute tools. GROVER's deterministic application layer remains authoritative for IDs, paths, permissions, budgets, sign-off triggers, and side effects.

## What the student learns

The same student is trained across nine short task modes:

1. `route` — understand the work and destination workspace.
2. `continuity` — continue, reopen, create, branch, or clarify a conversation/project.
3. `retrieval` — select bounded conversation, project, and memory candidates.
4. `memory` — propose scoped create/update/delete/no-op memory operations.
5. `execution` — choose local response, tools, worker, workload tier, and permission triggers.
6. `clarify` — ask one high-value question only when missing information materially changes the work.
7. `brief` — compile a structured specialist-worker assignment.
8. `supervise` — accept, verify, retry, fall back, clarify, or stop after worker output.
9. `respond` — handle fast local greetings, status, profile, schedule, and navigation responses.

Each example contains synthetic GROVER state plus one strict JSON answer. Scenario families are split before paraphrase expansion so near-duplicate wording cannot leak from training into evaluation.

## Local artifacts and cleanup

By default, machine-specific files live in `%LOCALAPPDATA%\GROVER\manager-training`, outside Git and OneDrive:

- `datasets/` — compact generated JSONL and reports; retained.
- `base-model/` — downloaded ordinary model files; retained for resume and inference without Windows symlink privileges.
- `outputs/manager-v1/final-adapter/` — final LoRA adapter; retained.
- `outputs/manager-v1/checkpoint-*` — at most the two latest resumable checkpoints; older checkpoints are pruned.
- `logs/` and `reports/` — retained and small.
- `scratch/`, legacy Hugging Face caches, and package download caches — deleted after successful stages.

The launcher refuses to train when available disk or GPU memory is below its configured safety floor. An interrupted run resumes from its most recent valid checkpoint.

## Ready-to-use commands

- `PREPARE_MANAGER_TRAINING.cmd` installs the pinned isolated environment, creates and validates the dataset, downloads the base model, and checks the actual GPU and disk.
- `REVIEW_MANAGER_CASES.cmd` opens a plain-language sample of 90 ambiguous policy cases. These cases are quarantined and are not part of the current training split; review is useful but does not block this first run.
- `START_MANAGER_TRAINING.cmd` launches the long run as a hidden background process. Codex and the terminal can be closed afterward.
- `CHECK_MANAGER_TRAINING.cmd` prints the latest stage, progress, result, or error without changing the run.
- `STOP_AND_RESET_MANAGER_TRAINING.cmd` stops the recorded training process tree, removes only that partial run, and returns the setup to a step-zero green preflight. It preserves the environment, base model, validated dataset, reports, and prior logs.
- `PREPARE_MANAGER_INFERENCE.cmd` reproducibly exports the effective checkpoint-750 NF4 model, merges the adapter, converts it to a pinned Q8 GGUF, installs the pinned CUDA runtime, verifies hashes, and deletes large conversion intermediates.
- `CHECK_MANAGER_INFERENCE.cmd` reports the prepared runtime plus sampled and full held-out promotion results without starting or changing the model.

When these files are opened by double-clicking, their console remains visible until a key is pressed. Starting training only launches the hidden worker; closing the launcher window afterward does not stop the run. The first numbered progress update appears after the initial ten optimizer steps, which is roughly four to five minutes on the verified laptop.

The final evaluator never promotes a merely completed adapter. It writes `complete_not_promoted` unless every configured accuracy, authority-boundary, and fast-path latency gate passes. Until a later integration slice explicitly enables shadow use, the adapter cannot control the live GROVER app. If the learned behavior is accurate but the default Transformers runtime misses the three-second p95 fast-path gate, the next step is optimized inference or a smaller student—not lowering the everyday-use standard.

## Measured laptop profile

The verified local device is an RTX 3050 Laptop GPU with 4 GB VRAM, not the previously expected 3060 Ti. The short training smoke processed 0.61 examples/second and peaked at 3,654.5 MB allocated, but it did not predict sustained laptop behavior. The real run reached step 770 of 1,125 in 43.6 hours before it was deliberately stopped; later steps slowed sharply under sustained power and memory pressure. Checkpoint 750 was preserved with its optimizer, scheduler, random, and trainer state. Its original Transformers evaluation scored 90/90 exact decisions but measured 16.24-second p95 latency.

The exact-NF4 merged Q8 GGUF candidate preserves the effective quantized weights used during training. On the same laptop, its first balanced 90-case held-out run scored 90/90 exact decisions, zero authority violations, and 1.257-second warm p95 latency. A standard Q8 base plus a separate adapter was faster but failed continuity and execution gates, so it was rejected and deleted. The optimized candidate remains shadow-only until the complete 2,700-case held-out evaluation passes.

## Moving to another Windows NVIDIA computer

The repository is the portable source bundle. For fresh training, copy the `Grover v2` folder to the other computer, run `PREPARE_MANAGER_TRAINING.cmd`, and start a new run. Preparation deterministically recreates the same hashed curriculum and downloads machine-appropriate runtime files outside the copied repository.

Resuming checkpoint 750 on another GPU must retain its original `gpu_4gb` rank-8, 768-token training profile even if the target has more VRAM. Do not let automatic hardware selection rebuild it with rank 16 or 24; that is a different adapter shape. Copy `outputs/manager-v1/checkpoint-750`, the base model, and the validated dataset, then use a resume launcher that pins the checkpoint manifest. Fast inference does not have this restriction: the prepared GGUF model behaves the same across supported NVIDIA devices, with hardware affecting latency rather than decisions.

To avoid downloading the 3.8 GB base model again, also copy `%LOCALAPPDATA%\GROVER\manager-training\base-model` into the same location on the target account before preparation. Do not copy the `.venv`; Python/CUDA wheels should be installed fresh for the target machine.

## Dataset authorship boundary

The corpus contains procedural GROVER policy and fully synthetic application state. It does not contain real vault rows, personal conversations, project files, secrets, or a bulk export of any provider's model output. If this experiment later becomes a distributed or commercial product, model licenses and provider terms must be reviewed again before creating any teacher-output distillation pipeline.

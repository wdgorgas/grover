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

When these files are opened by double-clicking, their console remains visible until a key is pressed. Starting training only launches the hidden worker; closing the launcher window afterward does not stop the run. The first numbered progress update appears after the initial ten optimizer steps, which is roughly four to five minutes on the verified laptop.

The final evaluator never promotes a merely completed adapter. It writes `complete_not_promoted` unless every configured accuracy, authority-boundary, and fast-path latency gate passes. Until a later integration slice explicitly enables shadow use, the adapter cannot control the live GROVER app. If the learned behavior is accurate but the default Transformers runtime misses the three-second p95 fast-path gate, the next step is optimized inference or a smaller student—not lowering the everyday-use standard.

## Measured laptop profile

The verified local device is an RTX 3050 Laptop GPU with 4 GB VRAM, not the previously expected 3060 Ti. A four-step benchmark processed 0.61 examples/second and peaked at 3,654.5 MB allocated. The 18,000-example training epoch therefore projects to about 8.2 hours on this laptop. Periodic loss checks plus the capped 450-case held-out generation evaluation make roughly 9–12 hours a realistic unattended window. This machine is sufficient, but other GPU-heavy applications should be closed; an 8 GB or larger NVIDIA GPU should be materially faster and gives more memory margin.

## Moving to another Windows NVIDIA computer

The repository is the portable source bundle: copy the `Grover v2` folder to the other computer, then run `PREPARE_MANAGER_TRAINING.cmd` and `START_MANAGER_TRAINING.cmd` there. Preparation deterministically recreates the same hashed curriculum and downloads machine-appropriate runtime files outside the copied repository. Hardware profiles change sequence length, LoRA rank, and evaluation sample count—not the labels or held-out split.

To avoid downloading the 3.8 GB base model again, also copy `%LOCALAPPDATA%\GROVER\manager-training\base-model` into the same location on the target account before preparation. Do not copy the `.venv`; Python/CUDA wheels should be installed fresh for the target machine.

## Dataset authorship boundary

The corpus contains procedural GROVER policy and fully synthetic application state. It does not contain real vault rows, personal conversations, project files, secrets, or a bulk export of any provider's model output. If this experiment later becomes a distributed or commercial product, model licenses and provider terms must be reviewed again before creating any teacher-output distillation pipeline.

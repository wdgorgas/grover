# P7 progress — local learned manager

P7 implements accepted PlanningProposal 008 as an offline, evaluation-gated training experiment. It does not replace GROVER's deterministic trust kernel or begin the deferred visual redesign.

## 2026-08-18 — scope and machine profile

**What changed:** Will approved a robust synthetic curriculum, small human review queue, local student-model training, and a non-interactive long run. The learned manager covers routing, project continuity, retrieval, memory operations, tool/worker/tier selection, clarification, briefing, supervision, and recovery.

**What I verified:** The clean RC.3 desktop smoke passed before P7 edits. The current device reports an NVIDIA RTX 3050 Laptop GPU with 4,096 MiB VRAM, CUDA-capable driver 596.08, Python 3.12, and about 37.5 GB free on `C:`. The training plan therefore targets Qwen3-1.7B with 4-bit QLoRA and bounded checkpoints; the same dataset remains portable to Will's desktop or Jackson's stronger GPU.

**What is still open:** Build and validate the schemas, curriculum generator, review path, evaluator, training pipeline, isolated environment, and a tiny end-to-end dry run.

**What the next person should do:** Continue the P7 setup without starting the long training job; leave Will one preflighted command once all short checks pass.

**Any risks or weirdness:** The GPU detected in Windows differs from the previously described 3060 Ti and has half the expected VRAM. A larger student may be evaluated later on stronger hardware, but configuring it on this laptop would create avoidable out-of-memory and disk-pressure failures.

## 2026-08-18 — curriculum and review gate green

**What changed:** Added nine strict manager task contracts, a deterministic stateful scenario generator, family-first split assignment, semantic leakage normalization, reference/authority validation, and a plain-language review window. The final `curriculum-v3` contains 18,000 training, 2,700 validation, 2,700 held-out test, and 315 quarantined review examples. Ordinary workers are provider-neutral configured capabilities rather than hard-coded Codex or Claude choices.

**What I verified:** Validation passed all 23,715 records across 5,889 families with zero family leaks, zero exact-input leaks, zero semantic-input leaks, zero invalid references, and zero forbidden real path/secret patterns. The final train hash is `af48c5adcd94b733e152bd23f1e5a9c41f9ad5effb6a6414a47cea912a6849d1`. The review window rendered and loaded a balanced sample without placing review cases into training.

**What is still open:** Will may review a few ambiguous cases at any time. Their results are saved separately and deliberately do not mutate this reproducible first curriculum.

**What the next person should do:** Do not edit generated runtime JSONL by hand. Change the generator/schema, issue a new curriculum release, and rerun the strict validator.

**Any risks or weirdness:** The first large corpus was correctly rejected for semantic duplication hidden behind changed IDs. Three disposable iterations were replaced before the final release; all rejected runtime folders were then removed.

## 2026-08-18 — portable training harness green

**What changed:** Added pinned isolated setup, direct ordinary-file model download for Windows, hardware profiles, disk/data/model preflight, completion-only 4-bit QLoRA, capped per-task generation, resumable checkpoints, strict held-out accuracy/authority/fast-path-latency evaluation, background launch/status commands, and guarded cleanup. The model is `Qwen/Qwen3-1.7B`; personal state stays external and the adapter remains offline unless every promotion gate passes.

**What I verified:** PyTorch 2.11.0/CUDA 12.8 and bitsandbytes 0.50.1 see the RTX 3050. The full 1.7B model loaded in 4-bit, real backward/optimizer steps completed without OOM, four full steps sustained 0.61 examples/second, and peak allocated GPU memory was 3,654.5 MB. A stopped two-step run saved checkpoints 1/2; relaunch restored checkpoint 2 and ran only step 3. The hidden launcher completed after its initiating console returned, status reported the detached process, and cleanup preserved the 3.8 GB base model plus curriculum while deleting scratch and named rejected runs. Seven focused unit checks and a nine-task evaluator smoke passed mechanically; the four-step adapter correctly failed promotion rather than being treated as trained.

**What is still open:** The approximately 8.2-hour training epoch plus evaluation has intentionally not been started, per Will's request to launch it himself after setup. No learned model has been integrated into live routing.

**What the next person should do:** Will runs `START_MANAGER_TRAINING.cmd`, may close Codex, and checks progress with `CHECK_MANAGER_TRAINING.cmd`. After completion, inspect the test report before proposing any shadow integration.

**Any risks or weirdness:** The 4 GB laptop has only about 440 MB between measured peak allocation and physical VRAM, so other GPU-heavy applications should be closed. The repository and deterministic corpus generator are portable to an 8 GB or larger Windows NVIDIA machine, which is the preferred faster path but not required.

## 2026-08-19 — double-click launcher feedback

**What changed:** All four Windows command launchers now remain visible until a key is pressed and distinguish success from failure in plain language. Training initialization explains that numbered progress begins at the first logging interval; the review launcher confirms that its separate window opened.

**What I verified:** Will's first `manager-v1` launch did start successfully despite the console closing: the detached Python worker remained active and the RTX 3050 reported about 91% utilization. At Will's request, the complete process tree was then stopped, the orphaned CUDA worker was detected and terminated, the partial run directory was removed, GPU memory returned, and preflight passed. The reusable stop-and-reset command also passed idempotently with no active run.

**What is still open:** No long run is active. A clean step-zero run must finish and pass held-out accuracy, authority, and latency gates before any shadow integration.

**What the next person should do:** Start `manager-v1` once with `START_MANAGER_TRAINING.cmd`; the window now stays open. Use `CHECK_MANAGER_TRAINING.cmd` for progress or `STOP_AND_RESET_MANAGER_TRAINING.cmd` for a clean interruption.

**Any risks or weirdness:** Status remains at initialization until step 10 because logging every micro-step would add unnecessary I/O during the long run.

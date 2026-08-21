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

## 2026-08-21 — checkpoint 750 and fast laptop inference

**What changed:** Audited the sustained run at step 770 after 43.6 hours, stopped only the exact manager process tree, and preserved complete checkpoints 600/750. Added checkpoint-profile pinning for cross-device resume, an exact NF4 dequantize-and-merge exporter, a pinned CUDA `llama.cpp`/Q8 preparation path, raw Qwen no-think prompt parity, resumable server evaluation, visible preparation/status launchers, hash verification, and guarded cleanup of conversion intermediates.

**What I verified:** The original checkpoint-750 Transformers sample scored 90/90 exact but 16.24-second p95. A standard Q8 base plus separate LoRA reached 1.82-second p95 but failed continuity/execution and was rejected; checkpoint 600 was worse and introduced authority violations. Exporting the effective NF4 weights, safely merging the checkpoint-750 LoRA, and quantizing that merged model to Q8 restored 90/90 exact decisions, zero authority violations, and 1.257-second warm p95 on the 4 GB RTX 3050. Ten focused tests, PowerShell parsing, idempotent preparation, visible status, model hashing, and the existing RC.3 desktop golden path pass. Only the successful 1.83 GB candidate remains; free disk returned to about 25 GB.

**What is still open:** The complete 2,700-case held-out evaluation is running resumably in shadow mode. The manager is not connected to live GROVER routing. Persistent live service authentication/CORS is a security-boundary change and requires the explicit approved security sign-off before integration.

**What the next person should do:** Let the full evaluation finish, record the final report and sustained p95, and keep the candidate offline if any accuracy, schema, authority, or three-second gate fails. If it passes, request the narrow local-service security approval, then integrate shadow comparison before allowing learned decisions to affect navigation or execution.

**Any risks or weirdness:** The adapter was brittle to changing its quantized base representation even when the replacement Q8 base was nominally higher precision. Only the exact-NF4 merged Q8 export preserved behavior; an exact-merged Q4 experiment reached 1.337-second p95 but failed schema, routing, clarification, and authority gates and was deleted. Four-slot continuous batching changed seven of its first 120 outputs and was also rejected, so live inference remains one deterministic slot. The model reached 4,148.9 MB allocated briefly during one-time dequantization by using Windows-managed spillover, but runtime inference uses about 2.1 GB VRAM. The first full-gate attempt exposed `llama-server`'s default 8 GB host prompt cache after 566 distinct prompts; it consumed 6.35 GB working memory and throttled the GPU through Windows paging. Full evaluation resumes from saved rows with host cache disabled while active-slot prefix caching remains enabled.

## 2026-08-21 — authenticated Windows shadow integration

**What changed:** After Will explicitly approved the security boundary, the native Electron main process gained a managed local-manager runtime. It verifies the prepared manifest and 1.83 GB model hash, chooses an ephemeral loopback port, creates a fresh in-memory 256-bit API key, launches one hidden deterministic inference slot, disables the web UI, slot endpoint, host cache, wildcard CORS, credentials, and LAN binding, and terminates the child with the application. Route outputs are strictly validated and stored as shadow comparisons; user prompts are represented in the audit by SHA-256 plus existing conversation/task references rather than duplicated text.

**What I verified:** All 67 deterministic application checks and the normal Electron smoke pass. The real Windows app displayed `Shadow ready`, produced an authenticated local route in 583 ms, wrote the comparison, kept General authoritative even under a deliberately differing test manager, captured rendered evidence at `app/test-results/manager-shadow-live.png`, and left no manager process after exit. The exhaustive evaluator was paused at 1,856 complete rows and resumed from that exact point.

**What is still open:** The manager remains non-authoritative until the full protected gate finishes and later shadow evidence covers route and continuity disagreements. Only the route task is connected; continuity, bounded retrieval, memory proposals, execution planning, clarification, briefing, supervision, and fast local response remain model capabilities awaiting isolated shadow slices.

**What the next person should do:** Finish and record the 2,700-case gate, then add continuity shadow input using bounded FTS candidates. Do not let learned output affect routing until disagreement review and the promotion criteria are green.

**Any risks or weirdness:** PowerShell wrote the inference manifest with a UTF-8 BOM, so the native reader explicitly accepts that one leading marker before parsing. Hash verification adds startup work but happens asynchronously while the desktop window remains usable. The runtime is discovered under `%LOCALAPPDATA%`; packaging the prepared model/runtime for another laptop remains a later delivery slice.

## 2026-08-21 — bounded continuity shadow

**What changed:** Added the trained continuity task behind the same authenticated process. GROVER's existing FTS index supplies no more than eight active candidate conversations with stable IDs, titles, contexts, and project IDs. The current conversation/project is explicitly retained for generic follow-ups such as “go ahead.” The validator rejects any conversation or project ID outside that shortlist. Route completes before continuity, but both remain asynchronous audit proposals.

**What I verified:** The suite now has 70 passing deterministic checks, including invented-ID refusal, exact conversation-to-project pairing, an eight-candidate hard cap, named-project reopen, generic current-project continuation, bounded candidate shape, and proof that learned disagreement cannot change the deterministic result. In the real Electron app, `hello` rendered in 78 ms, “Let's code tictactoe” branched to Coding in 68 ms, and authenticated route plus continuity shadow work completed in 1.837 seconds. The rendered evidence was refreshed at `app/test-results/manager-shadow-live.png`.

**What is still open:** Continuity is still shadow-only and needs accumulated real disagreement review before authority. The exhaustive 2,700-case gate remains resumable from 2,173 completed rows. Retrieval, memory, execution, clarification, briefing, supervision, and fast-response shadow slices remain unconnected.

**What the next person should do:** Resume the full gate from 2,173, record its protected metrics, then implement bounded retrieval shadow candidates without sending full vault or conversation content.

**Any risks or weirdness:** A same-family official Qwen3-0.6B Q8 speculative draft was tested after a throttled route exceeded three seconds. It worsened latency to roughly six seconds because the additional 0.8 GB model increased pressure on the 4 GB GPU, so it and its incomplete benchmark were deleted. No speculative dependency was adopted. The successful two-stage smoke subsequently completed under three seconds with the single exact manager.

## 2026-08-21 — bounded retrieval warm start

**What changed:** Added the trained retrieval task after route and continuity, but only when local FTS found relevant state or the request explicitly calls for recall, progress, scheduling, continuation, or audit. Each candidate type is capped at eight. The manager receives conversation titles, project names, stable IDs, and up to 160 characters of locally relevant memory summary; it never scans the vault. The durable shadow audit stores only IDs and a request hash.

**What I verified:** Seventy-two deterministic checks pass, including invented retrieval-ID refusal, bounded memory warm start, and proof that vault text is absent from the audit record. The real app reopened the existing tic-tac-toe conversation in 68 ms, created no duplicate, and validated route, continuity, and retrieval outputs. After the preceding sustained GPU load, the full shadow chain took 24.58 seconds; because it was asynchronous, the user-visible reopen remained immediate.

**What is still open:** Retrieval remains shadow-only. Its post-stress latency demonstrates that the complete learned chain cannot replace deterministic fast paths on this laptop yet. The protected evaluator is resumable at 2,477/2,700. Memory-operation, execution, clarification, briefing, supervision, and fast-response shadow tasks remain unconnected.

**What the next person should do:** Finish the final 223 held-out cases and record accuracy separately from interactive warm latency. Keep exact local recall/navigation as the everyday fast path; use accumulated shadow disagreements to decide where one learned task adds enough value to justify its latency.

**Any risks or weirdness:** Local memory summaries are sent only to the authenticated loopback model and are not duplicated into the shadow audit. `MemoryService.retrieve` already excludes instruction-like content and `jackson-private`; selected IDs are revalidated against the supplied candidate sets before recording. The learned chain's latency varies sharply with sustained laptop GPU power state even though visible local behavior does not.

## 2026-08-21 — full protected inference gate complete

**What changed:** Finished the resumable 2,700-case held-out inference gate and wrote the final protected report under the local manager-inference benchmark directory. The candidate was not promoted because the predeclared latency gate failed.

**What I verified:** The report contains 2,700 unique cases, 100% schema validity, 100% route and continuity accuracy, 1.0 retrieval F1, 100% execution and scored memory-operation accuracy, 100% clarification balanced accuracy, and zero authority-boundary violations. There were three exact-string differences out of 300 memory cases; all three preserved the operation, scope, sensitivity, and meaning while changing "calendar responses" to "calendar displays." Sustained p95 latency was 6.1792 seconds against the 3-second ceiling.

**What is still open:** The manager is accurate enough to keep collecting shadow evidence, but the complete learned chain is not fast enough to control every laptop prompt. Memory-operation, execution, clarification, briefing, supervision, and fast-response tasks remain unconnected to the app. Visual redesign remains intentionally deferred.

**What the next person should do:** Keep deterministic local greetings, exact recall, navigation, and conversation continuity on the visible path. Use shadow disagreements and real user failures to select the next single learned task; optimize or distill only that task rather than adding the whole nine-task chain to every request.

**Any risks or weirdness:** A delayed pre-compaction evaluator briefly created a second writer. Both processes were stopped, 11 duplicate generated rows were removed by stable case ID, and the gate resumed with exactly one runtime and one writer. The final report was generated from exactly 2,700 unique IDs, and the benchmark runtime was stopped after completion.

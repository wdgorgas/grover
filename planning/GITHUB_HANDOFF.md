# GROVER v2 — GitHub-only cross-device handoff

Last updated: 2026-08-25

This is the canonical practical handoff for continuing GROVER from another Windows computer using only the GitHub repository. Read `AGENTS.md` first; `planning/grover_v2_master_prompt.md` remains the binding product spec, and accepted `planning/proposals/proposal_009_manager_first_observability.md` governs the current manager-first implementation.

## Product direction

GROVER is a native, local-first Windows application. Home accepts natural language, the learned local manager organizes work into persistent context conversations/projects, local data remains editable in SQLite and Markdown, and configurable specialist agents such as Codex do the substantive external-model work. Visual redesign is intentionally deferred until the functional system is dependable.

The learned manager is the semantic authority for meaningful requests. It owns route, continuity, retrieval, memory decisions, local-response/delegation choice, clarification, execution/worker/tier selection, worker briefing, and post-worker supervision. Deterministic application code validates available IDs and enforces privacy, permissions, budgets, evidence, and the five protected approval triggers. Do not reintroduce a competing handcrafted semantic router to hide latency.

## Current verified implementation

- Native Electron application; Enter sends and Shift+Enter inserts a line.
- Home branches/reopens conversations inside General, Coding, Research, Finance, Health, Business, or GROVER Builder workspaces.
- Codex is the preferred provider-neutral specialist; Claude remains optional and is not required.
- The authenticated local Qwen manager exposes all nine trained contracts and is authoritative in the production request IPC.
- Manager flight recorder stores task/conversation/project references, request hash, model/prompt/app version, bounded replay state, every stage output/latency, and terminal state.
- Automatic incidents capture manager validation errors, provider failures, failed tasks, and recurring slow stages; fingerprints deduplicate recurring problems while occurrences remain countable.
- Every assistant result can be reported with problem type, note, and expected behavior. The bottom-left `!` view is the incident inbox.
- Replay reconstructs the affected manager stage without duplicating raw request text in its snapshot. A satisfactory replay can be explicitly approved as an exact regression expectation; active cases can be rerun as a suite.
- Profile memory and project memory are separate. Project records retain goals, requirements, decisions, outcomes, artifacts, next actions, status, provenance, expiry, and human-readable vault files. Project state is warm-started into manager retrieval instead of being flattened into profile facts.
- Memory backup format v2 includes project records, project memories, artifacts, minimal project conversation identity, and Markdown vault notes.
- Existing event-spine, policy, kill-switch, budget, backup/restore, project isolation, and Builder evidence protections remain active.

Latest verified baseline at this writing: 86 deterministic tests plus the rendered Electron smoke. The current working branch may be ahead while the active slice is being completed; use `git log --oneline -12` and `planning/p7_progress.md` for the newest committed evidence.

## Repository and local data boundaries

GitHub contains source, tests, schemas, synthetic curriculum generators, configuration, and documentation. It intentionally does not contain personal database/vault data, secrets, downloaded model weights, CUDA binaries, Python environments, generated packages, or the 1.83 GB prepared manager model.

Default local application data:

- Application database/vault/evidence: `%APPDATA%\grover` for the packaged app.
- Prepared inference bundle: `%LOCALAPPDATA%\GROVER\manager-inference`.
- Training data/models/checkpoints: `%LOCALAPPDATA%\GROVER\manager-training`.
- Automatically created Coding folders: shown in Settings/runtime and normally under the app data project root.

Never copy or inspect `jackson-private`. Never commit `%APPDATA%\grover`, vault content, `.env`, credentials, model files, or generated evidence.

## Fresh checkout on another Windows computer

Prerequisites:

- Git.
- Node.js 22.18 or newer.
- A supported Windows NVIDIA driver/GPU for fast local manager inference. CPU fallback is not the intended daily-driver configuration.
- A Codex sign-in for specialist work. Claude is optional.

Commands from PowerShell:

```powershell
git clone https://github.com/wdgorgas/grover.git "C:\Grover v2"
Set-Location "C:\Grover v2\app"
npm ci
npm test
npm run test:desktop
```

Development launch:

```powershell
Set-Location "C:\Grover v2\app"
npm start
```

The app runs without the manager only when `GROVER_DISABLE_MANAGER=true` is deliberately set for tests/fallback diagnostics. Normal production use expects the prepared manager bundle.

## Moving the trained manager

Fastest exact transfer: copy the complete `%LOCALAPPDATA%\GROVER\manager-inference` folder from the source computer to the identical location under the target Windows account. It contains the pinned CUDA `llama.cpp` runtime, inference manifest, and exact-NF4 merged Q8 GGUF candidate. The app verifies the manifest/model hash before launch.

The prepared candidate is about 1.83 GB. GPU choice should affect latency, not learned decisions. Do not swap in a nominally “better” quantization: standard Q8 plus LoRA, exact-merged Q4, and multi-slot batching all changed behavior and were rejected.

If the inference bundle is unavailable but the training artifacts were copied, run `PREPARE_MANAGER_INFERENCE.cmd`. If neither local bundle exists, the GitHub repository alone can regenerate the synthetic curriculum and download the base model, but it cannot reconstruct the already-trained checkpoint-750 adapter because weights/checkpoints are intentionally not committed. Copy `%LOCALAPPDATA%\GROVER\manager-training\outputs\manager-v1\checkpoint-750` plus the base model/dataset, or copy the ready inference bundle.

Do not copy a Python `.venv` between computers. Reinstall machine-specific Python/CUDA dependencies with the provided preparation launchers.

## Verification commands

From `app`:

```powershell
npm test
npm run test:desktop
npm run test:manager-live
npm run test:engine
npm run test:coding-live
npm run test:builder
npm run dist
npm run test:portable
```

Use live/provider/Builder checks deliberately because they invoke actual local runtimes or provider agents. Deterministic and desktop tests use isolated temporary data. Generated screenshots and packages are gitignored.

## High-value source map

- `app/src/core.ts` — request lifecycle, manager sequencing, worker execution, project outcomes, policy/budget integration.
- `app/src/manager.ts` — local runtime, prompt parity, nine typed contracts, strict validators.
- `app/src/diagnostics.ts` — flights, incidents, replay, regression promotion.
- `app/src/project-memory.ts` — project identity, scoped vault, retrieval, outcomes, artifacts, expiry.
- `app/src/memory.ts` — profile/shared memory, vault sync, backup/restore.
- `app/src/db.ts` — complete SQLite schema and compatibility migrations.
- `app/src/store.ts` — conversations, projects, snapshots, routing records.
- `app/renderer/` — deliberately plain functional UI.
- `manager_training/` — dataset generation, contracts, training/evaluation/inference preparation.
- `DECISIONS.md` — implementation decisions and checked predictions.
- `planning/p7_progress.md` — chronological evidence and remaining work.

## Known limitations and honest risks

- Full manager capability means several sequential local inferences. Accuracy/best-result behavior is the baseline; latency optimization must preserve replay parity and always fall back to the full manager.
- The protected 2,700-case manager report was excellent on schema/accuracy/authority, but sustained p95 was 6.1792 seconds. Interactive latency varies under laptop power/GPU pressure.
- Exact replay currently targets manager stages. End-to-end specialist answer replay still needs bounded worker/artifact fixtures; a changed manager output is never automatically called fixed without explicit approval.
- Calendar and other external account tools remain disconnected. Lifestyle scheduling is a later sub-app, not the product center.
- Visual design is temporary by explicit direction.
- Existing portable executables under `app/release` predate the current manager/diagnostics/project-memory work until the final package slice creates a new candidate.
- GitHub alone does not include the trained model bytes or personal app data; transfer instructions above are required for identical local inference and continuity.

## Remaining work in required order

1. Measure per-stage live latency under the authoritative path. Add only behavior-proven optimizations such as exact cache reuse or consolidated calls; require regression/shadow parity and full-manager fallback.
2. Rewrite the old live-manager shadow smoke as an authoritative lifecycle/flight smoke and capture screenshot/timing evidence.
3. Update application/root READMEs and planning board to remove obsolete “shadow-only” wording.
4. Bump the release candidate version, bundle or co-deliver the verified manager runtime/model, build the Windows portable executable, and run packaged plus live-manager smoke.
5. Record final package hash/path, final test counts, Git commit, GitHub push, and five-line handoff here and in `planning/p7_progress.md`.

## Safe resume procedure for the next developer

1. Read `AGENTS.md`, the binding master prompt, Proposal 009, this file, and the last section of `planning/p7_progress.md`.
2. Run `git pull`, `git status`, `git branch`, and `git log --oneline -12`. Preserve any user-owned changes; in the source session `JACKSON_START_HERE.md` is a user-owned deletion and must never be staged or restored accidentally.
3. Run `npm test` and `npm run test:desktop` before editing.
4. Work on a `phase-p7-*` branch, verify the bounded slice, review the diff, update `DECISIONS.md` when prompts/tools/harness change, commit, merge to `master`, and push.
5. Never weaken manager authority, privacy, tool/ID validators, the kill switch, audit behavior, or the five approval boundaries to make a test pass.

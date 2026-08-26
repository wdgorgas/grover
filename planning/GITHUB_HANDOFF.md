# GROVER v2 — GitHub-only cross-device handoff

Last updated: 2026-08-26

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
- A 256-entry process-local exact cache reuses only already-validated manager outputs when the complete task/input hash is identical; any changed state runs full inference. Cache hits remain visible as zero-latency flight stages.
- Production UUIDs are losslessly aliased only in typed manager reference fields and restored before validation/storage. Server prompt-prefix reuse is disabled because live repeated calls proved it could leak fields between contracts; user text is never rewritten.
- Project goals and requirements remain retrieval/briefing context but are not mislabeled as local facts that can satisfy the work request. This keeps the trained respond contract authoritative instead of overriding a false local answer in code.
- Non-durable manager memory proposals are refused and become linked `wrong_memory` incidents instead of polluting the vault.
- Existing event-spine, policy, kill-switch, budget, backup/restore, project isolation, and Builder evidence protections remain active.

Latest verified source baseline at this writing: 89 deterministic tests, 10 manager-training/runtime tests, the rendered Electron smoke, 18 exact protected manager parity cases, and the rendered authoritative manager lifecycle smoke. A real nine-stage Coding lifecycle completed in 8.738 seconds, and both the rebuilt unpacked application and the exact single-file candidate passed bundled-manager routing plus real supervised Codex file creation. Use `git log --oneline -12` and `planning/p7_progress.md` for the newest committed evidence.

## Verified Windows release candidate

- Fast everyday launch on this device: `app/release/win-unpacked/GROVER.exe`; keep its complete folder together.
- Drag-and-drop transfer artifact: `app/release/GROVER-2.1.0-rc.1-portable.exe`.
- Artifact size: 1,941,125,568 bytes (about 1.81 GiB).
- Artifact SHA-256: `932FDDBEFF82FE614CFCC9D8E95BCA778F1605F9CAC6F9146813D00945545105`.
- Embedded manager model SHA-256: `81B169E7862D63ED06A1D64E6864F0BA76A0222E0E87B9FCDBD6EA31F22EAEC0`.
- Exact portable smoke: 228.686 seconds extraction/startup, 4.273 seconds manager greeting, and 78.235 seconds for a natural Coding request whose file bytes were independently verified after bundled Codex execution and manager supervision.
- Candidate implementation commit: `ba207c1`.
- Release tag: `v2.1.0-rc.1`.

Generated packages are intentionally ignored by Git. The source, rebuild automation, audit, and next steps are carried by GitHub; the 1.81 GiB executable must be copied directly or attached to a release separately.

## Repository and local data boundaries

GitHub contains source, tests, schemas, synthetic curriculum generators, package/rebuild automation, configuration, and documentation. It intentionally does not commit personal database/vault data, secrets, downloaded model weights, CUDA binaries, Python environments, generated packages, or the 1.83 GB prepared manager model. The locally generated RC.1 portable executable bundles the exact manager and runtime, but remains a release artifact rather than Git source.

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

If you have the generated release artifact, no separate Node.js, Python, model, `llama.cpp`, or Codex runtime download is required to run it. Copy `GROVER-2.1.0-rc.1-portable.exe`, open it, and sign in to Codex from Settings when specialist work is needed. Windows may warn because this development candidate is not signed with a purchased public certificate.

## Moving the trained manager

For a source/development checkout, the fastest exact transfer is to copy the complete `%LOCALAPPDATA%\GROVER\manager-inference` folder from the source computer to the identical location under the target Windows account. It contains the pinned CUDA `llama.cpp` runtime, inference manifest, and exact-NF4 merged Q8 GGUF candidate. The app verifies the manifest/model hash before launch. The RC.1 portable package embeds this same folder and prefers it over any machine-local manager.

The prepared candidate is about 1.83 GB. GPU choice should affect latency, not learned decisions. Do not swap in a nominally “better” quantization: standard Q8 plus LoRA, exact-merged Q4, and multi-slot batching all changed behavior and were rejected.

If the inference bundle is unavailable but the training artifacts were copied, run `PREPARE_MANAGER_INFERENCE.cmd`. If neither local bundle exists, the GitHub repository alone can regenerate the synthetic curriculum and download the base model, but it cannot reconstruct the already-trained checkpoint-750 adapter because weights/checkpoints are intentionally not committed. Copy `%LOCALAPPDATA%\GROVER\manager-training\outputs\manager-v1\checkpoint-750` plus the base model/dataset, or copy the ready inference bundle.

Do not copy a Python `.venv` between computers. Reinstall machine-specific Python/CUDA dependencies with the provided preparation launchers.

## Verification commands

From `app`:

```powershell
npm test
npm run test:desktop
npm run test:manager-parity
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
- The final real-laptop greeting sweep measured 4.027 seconds cold (3.761 seconds recorded manager work), 1.592 seconds after state warming, and 0.160 seconds for an exact request/state repeat. A nine-stage Coding lifecycle measured 8.738 seconds. Novel full-chain sub-three-second behavior still needs a consolidated trained contract or smaller parity-proven student.
- The protected 2,700-case manager report was excellent on schema/accuracy/authority, but sustained p95 was 6.1792 seconds. Interactive latency varies under laptop power/GPU pressure.
- Exact replay currently targets manager stages. End-to-end specialist answer replay still needs bounded worker/artifact fixtures; a changed manager output is never automatically called fixed without explicit approval.
- Calendar and other external account tools remain disconnected. Lifestyle scheduling is a later sub-app, not the product center.
- Visual design is temporary by explicit direction.
- The exact single-file portable smoke took 228.686 seconds to extract/start on this laptop. `release/win-unpacked/GROVER.exe` is the faster-starting local form when the complete folder is kept together; the portable wrapper is primarily the drag-and-drop transfer form.
- GitHub source alone does not include the trained model bytes or personal app data. Use the generated RC.1 artifact or the transfer instructions above for identical local inference; copy an app backup separately for personal continuity.

## Future project-navigation UX direction (not implemented)

Do not model every open project as a permanent tab, and do not require a full natural-language request merely to navigate. The recommended interaction model is one main project canvas plus a layered project switcher:

- Make **project**, not conversation, the top-level navigation object. A project can present its overview, current/older conversations, artifacts, activity, and scoped memory inside one place, so background agent threads do not flood the global history.
- A small left-side **working set** shows only pinned projects and the last few active projects, with status/activity markers. It is bounded and automatically ages inactive entries out; removing an entry never deletes or archives the project.
- `Ctrl+K` or one visible launcher opens a glass-style **Project Shelf** over the current canvas. It combines fuzzy title search, semantic search over goals/outcomes/aliases, context/status filters, and keyboard navigation. Typing two or three identifying characters should normally be enough.
- Exact title/alias matching, filters, recency, and pinning should query the local project index immediately without model latency. Invoke the manager only for genuinely semantic or ambiguous recall, then show its suggested match rather than forcing a new conversation.
- With no query, the shelf leads with **Resume**, **Recently active**, **Pinned**, and **Needs attention**. Each result shows a compact preview: context, goal, latest outcome, next action, and last activity. A hover/Space quick-look previews it without navigating.
- Normal Back/Forward navigation returns through recently viewed projects. An optional two-project split is useful for comparison, but unlimited persistent tabs are not.
- Home may proactively show a few likely continuation cards based on recency and manager retrieval. Natural language remains available for ambiguous requests such as “reopen the investing bot,” but it is one access path, not the only one.
- Archive, pin, alias, move, and status are durable organization controls. “Close” should only remove a project from the temporary working set, avoiding destructive tab semantics.

The visual glass treatment should serve this layering—canvas, shelf, quick look—not be applied uniformly. Readability, keyboard access, reduced transparency, and low-GPU fallback matter more than blur effects.

## Recommended next development order

1. Use the app for real work and report incorrect results from the assistant message itself. Replay each implicated manager stage, approve the intended output once, and keep the resulting cases in the regression suite.
2. Train and gate a consolidated lifecycle contract or smaller student against the accumulated exact regressions to bring novel manager requests under three seconds without demoting the manager or adding a competing semantic router.
3. Add end-to-end specialist replay fixtures covering worker briefing, produced artifacts, and supervision—not merely the current exact manager-stage replay.
4. Add conversation/history management and selected niche sub-apps only after real usage reveals the highest-value workflows. Calendar is one candidate, not the product center.
5. Apply Will's new visual direction after the functional/UX findings stabilize.

## Safe resume procedure for the next developer

1. Read `AGENTS.md`, the binding master prompt, Proposal 009, this file, and the last section of `planning/p7_progress.md`.
2. Run `git pull`, `git status`, `git branch`, and `git log --oneline -12`. Preserve any user-owned changes; in the source session `JACKSON_START_HERE.md` is a user-owned deletion and must never be staged or restored accidentally.
3. Run `npm test` and `npm run test:desktop` before editing.
4. Work on a `phase-p7-*` branch, verify the bounded slice, review the diff, update `DECISIONS.md` when prompts/tools/harness change, commit, merge to `master`, and push.
5. Never weaken manager authority, privacy, tool/ID validators, the kill switch, audit behavior, or the five approval boundaries to make a test pass.

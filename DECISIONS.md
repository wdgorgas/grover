# DECISIONS.md — derive-and-record log (master prompt §14.2, §11.6, §11.8)

Low-level implementation decisions derived by builder sessions, with rationale and (where required) predictions checked at phase exits. Scope/policy changes do NOT belong here — those go through Will or §12 proposals.

---

## 2026-07-05 — P1 stack: Node 22 built-ins, zero external dependencies

**Decision:** App runs on Node ≥22.18 using built-in TypeScript type-stripping (erasable syntax only — no TS enums/namespaces), `node:sqlite` for the database, `node:test` for tests, `node:http` for the server (later slice). No npm dependencies.

**Why:** Master prompt §11.8 requires justifying any dependency against built-in primitives; all three primitives verified working in the build environment (Node v22.22.3). SQLite is mandated (§4.4). Zero deps = nothing to audit, nothing to break on Will's machine.

**Prediction (checked at P1 exit):** Node built-ins will cover every P1 exit criterion without adding a single npm package, except Playwright for browser evidence (already anticipated by §5 — will get its own entry when added).

## 2026-07-05 — Repo layout: application lives in `app/`

**Decision:** `app/src/` for code, `app/test/` for tests, `app/data/` (gitignored) for runtime SQLite files. Keeps planning/, design/, archive/ untouched.

## 2026-07-05 — Money stored as integer microdollars

**Decision:** All cost fields (`events.cost_delta`, projection `cost_total`, future cost_ledger) are INTEGER micro-USD (1_000_000 = $1). Field name `cost_delta` kept exactly as spec'd (§4.3).

**Why:** Model-call costs are fractions of a cent; floats drift; integers make budget-cap comparisons (§7) exact.

## 2026-07-05 — Event-spine slice: derived reducer semantics (placeholders, narrow)

**Decision:** For the first spine slice: (a) task `status` mirrors the latest lifecycle-phase event (intake/planning/editing/verifying/blocked/done/failed/cancelled); policy/budget/memory/system events update plain_language and cost only. (b) Task `origin` (foreground/background, §4.3) derives from the first event's actor: `will` → foreground, else background. (c) Server-computed `actions`: active statuses → [pause, cancel]; blocked → [cancel]; terminal → []. (d) BuildRun status mapping from event phase is a minimal placeholder; the full BuildRun state machine (queued/paused etc.) lands with the engine slice.

**Why:** §4.3 mandates the mechanism (projections reduced from events, actions computed server-side) but not these micro-mappings. Chosen minimal so later slices refine mappings without touching the reduction mechanics.

**Prediction (checked at P1 exit):** the engine/SSE slices will change these mappings but will NOT need to change the events schema or the append/rebuild mechanics.

## 2026-07-05 — Idempotency collision = hard conflict; plain_language capped at 2000 chars

**Decision (per accepted PlanningProposal 001, items 2 and 8):** reusing an idempotency key with a *different* payload (any field except `ts`) throws a conflict error — never silently returns the original. `plain_language` is rejected when missing, empty, whitespace-only, or over 2000 characters (enforced in code and schema CHECK).

**Why:** silent ignore would let UI retries, SSE reconnects, and engine bugs hide real double-writes; 2000 chars keeps the event log human-scannable — long detail belongs in `internal_detail` or evidence assets.

## 2026-07-05 — Sandbox treats the mounted repo as read-suspect

**Decision:** Claude sandbox sessions must not run ANY git command against the mount (a read-only `git status` corrupted the index on 2026-07-05), and must not trust the mount's view of recently written files (stale/truncated reads observed same day). Tests run on a sandbox-local copy; the authoritative verification is `npm test` on the host before committing. Recorded in `GIT_SETUP.md`.

## 2026-07-10 — Cross-client contract and bounded maker/checker workflow

**Decision:** `AGENTS.md` is the cross-client development contract; client-specific files such as `CLAUDE.md` remain compatible supplements. Every change uses a slice branch. The default development loop is one maker pass, deterministic verification, one fresh-context checker pass, and at most two repair cycles, with the stopping rules in `planning/DEVELOPMENT_PROCESS.md`.

**Why:** The repository previously gave different agents contradictory Git instructions and allowed documentation to bypass the binding branch discipline. A bounded evidence-driven loop preserves independent review without creating an open-ended agent conversation.

**Prediction (checked at P1 exit):** The unified contract will produce complete five-line handoffs and independently reviewable evidence without requiring more than two repair cycles for any remaining P1 slice.

## 2026-08-18 — Electron host and portable Windows package

**Decision:** GROVER's first complete delivery is a local Electron desktop application with a sandboxed renderer, a narrow preload bridge, and authoritative application logic in the main process. Desktop IPC replaces SSE inside the packaged app. `electron-builder` produces a portable Windows executable; server deployment remains deferred.

**Why:** Will explicitly requires a runnable Windows application rather than a browser product and wants local development until functionality is complete. This machine already has Node but has neither a .NET SDK nor Rust, so Electron is the smallest implementation change that reuses the tested TypeScript core and produces a normal Windows app. Node built-ins cannot create or package a Windows GUI, so Electron and its packager satisfy the dependency exception in master prompt §11.8.

**Prediction (checked at the desktop P1 exit):** The packaged executable will launch without a browser or development server, preserve event and task state across restart, and support the golden functional flow with the renderer unable to access Node directly.

## 2026-08-18 — Provider-neutral engine router; Codex preferred initially

**Decision:** GROVER owns an engine registry and deterministic router. Codex and Claude implement the same normalized execution contract. Auto routing initially prefers Codex for Ask, Work, and Build, uses Claude as fallback and independent build checker, and records every selection, reason, fallback, and outcome. A per-request override remains available.

**Why:** Will explicitly rejected a single-model backbone and prefers Codex at this stage. A provider-neutral manager preserves that preference without turning it into architectural lock-in. Deterministic routing is inspectable and testable now; stored outcomes create the evidence needed to improve or later learn routing policy without self-reinforcing guesses.

**Prediction (checked after the first five real runs):** Disabling either provider will leave the same task, progress, cancel, evidence, and receipt flows working through the remaining engine, and routing records will make every selection explainable.

## 2026-08-18 — Playwright Core for Electron functional evidence

**Decision:** Use `playwright-core` only in development tests to launch the Electron application, drive its real renderer, assert state/DOM behavior, detect document navigation, capture console errors, and save a screenshot. It is not shipped in the production package.

**Why:** Electron's built-in primitives create the window but do not provide an external interaction harness. The desktop proposal replaces browser smoke evidence with equivalent Electron-window evidence; Playwright's Electron driver supplies that missing test primitive without downloading a second browser.

**Prediction (checked at packaging):** The same smoke test will pass before and after packaging-oriented changes without adding a browser runtime to the portable application.

## 2026-08-18 — Persistent conversations and deterministic context routing

**Decision:** Home requests are classified into General, Coding, Research, Finance, Health, Business, or GROVER using a small deterministic keyword router. Conversations and messages are stored in local SQLite and linked to the existing task/event records. The classification is automatic but remains visible and correctable through normal workspace navigation; it is not presented as a required intent form.

**Why:** Will wants GROVER to feel self-organizing while remaining fast and understandable. A deterministic first router supplies an immediate functional workflow and creates labeled examples without requiring another model call just to decide where a message belongs.

**Prediction (check after 25 varied real prompts):** At least 80% of Home prompts will open in the context Will expects, and misses will be explainable from stored rules/examples rather than opaque model behavior.

## 2026-08-18 — Codex native runtime shipped as an explicit portable resource

**Decision:** The Windows Codex executable is copied into Electron's resources as `codex-runtime/bin/codex.exe`; runtime discovery checks that stable packaged location before module-resolution fallbacks. The application probes provider authentication separately from execution health and exposes provider sign-in actions in Settings.

**Why:** Electron's portable self-extractor cannot reliably spawn an executable addressed through an old temporary `app.asar.unpacked` path. An explicit resource gives the packaged app a predictable executable path and prevents a missing file from being mislabeled as a login failure.

**Prediction (check in packaged smoke):** The portable executable will find and start Codex after a clean launch even when no development `node_modules` path is available, and a missing executable will display as unavailable rather than sign-in-required.

## 2026-08-18 — Continuous mechanical phase gates; human UX acceptance at the final pass

**Decision:** Under accepted PlanningProposal 006, deterministic phase checks remain hard gates, but development continues without waiting for routine human confirmations between P1–P5. The final v2.0 claim still requires Will's hands-on Builder and memory confirmation. The verbatim orb/final visual integration is deferred until the functional phases are complete so it can follow Will's new design direction.

**Why:** Will explicitly asked GROVER development to continue through all passes and rejected repeated report-only sign-offs. This preserves evidentiary rigor while removing idle handoff pauses and visual rework.

**Prediction (check at final acceptance):** Continuous implementation will expose UX issues through a runnable app sooner, while the final confirmation checklist will still identify any mismatch before v2.0 is declared complete.

## 2026-08-18 — Rendered UI verification runs outside the engine sandbox

**Decision:** Builder prompts explicitly forbid launching Electron, browsers, Playwright, or `test:desktop` inside a model engine sandbox. The engine runs non-GUI tests; after it returns, GROVER detects UI-file changes and runs the project's `test:desktop` script itself, requiring a DOM assertion and screenshot before closure.

**Why:** GUI subprocesses launched from the Codex workspace sandbox hung even though the identical smoke passed from GROVER's verification process. Verification authority already belongs to GROVER, not the model.

**Prediction (check at P3 exit):** The UI reliability fixture will finish without an engine timeout, and its BuildRun will contain both `dom_assertion` and `screenshot` evidence produced after the engine exits.

**P3 exit result:** Confirmed. The final live reliability run passed and the UI BuildRun contained both required evidence types.

## 2026-08-18 — Deterministic FTS context packs before learned retrieval

**Decision:** The v2.0 Context Manager retrieves only current, permitted memories using SQLite FTS5 plus deterministic token-overlap ranking, a hard character/item budget, and explicit namespace maps. Selected facts enter prompts with memory ID, provenance, date, and an instruction that memory is untrusted data rather than authority. Incidental profile statements become reviewable proposals rather than silent writes.

**Why:** This satisfies relevance, privacy, provenance, and budget requirements with inspectable local behavior. It also produces corrections and retrieval eval cases before any learned router/retriever is justified.

**Prediction (checked at P4 exit):** All 20 seeded include/exclude scenarios will pass, the future/Jackson namespaces will never leak into Builder packs, and a live restart recall will answer from the selected fact. **Result: confirmed.**

## 2026-08-18 — Five-rule policy gate, verified restore, and preserved-failure recovery

**Decision:** Implement exactly the five approved sign-off triggers as deterministic built-in PolicyRegistry rows. Every detected decision is stored atomically with an immutable event; direct instructions from Will approve only the exact detected action, `jackson-private` always denies, and imported or self-initiated actions pause. Retrieved content that resembles embedded instructions is excluded, and all remaining memory enters prompts as explicitly untrusted data. Memory exports carry a SHA-256 manifest; restore validates before mutation, creates a pre-restore backup, and marks any failed restore as a non-green warning. Failed builds preserve edits and emit a durable recovery card instead of attempting an automatic revert.

**Why:** These choices make P5 safety behavior local, inspectable, reversible, and testable without teaching a model to make governance decisions. Preserving a failed branch is safer than guessing which edits belonged to the user, while the recovery card supplies a concrete next step.

**Prediction (checked at P5 exit):** All five triggers will be independently provokable, hostile retrieved instructions will never reach an engine prompt, a tampered backup will leave live memory unchanged and health non-green, and a forced UI verification failure will retain the changed file with a complete recovery card. **Result: confirmed.**

## 2026-08-18 — Memory events preserve task context

**Decision:** A memory proposal linked to a task records the task's application context (`general`, `coding`, and so on) in the event domain. Its storage namespace remains inside the proposal payload/table and may never replace the task projection's context. Retrieval also falls back safely to the General namespace map if migrated data contains an unknown context.

**Why:** The RC.1 greeting path used `will-private` as the proposal event domain. The event reducer correctly treated that as a task-domain update, after which context retrieval crashed because `will-private` is a namespace, not an application context.

**Prediction (checked immediately):** The exact greeting `hey grover my name is will` will create one reviewable memory proposal, retain `general` as the task context, call Codex, and finish. **Result: confirmed by deterministic and live Codex regression tests.**

## 2026-08-18 — Local continuity coordinator before learned routing

**Decision:** Under accepted PlanningProposal 007, GROVER resolves destination context, existing-conversation match, local navigation, policy, and bounded context assembly before selecting an execution engine. Context precedence follows the work being performed: software creation outranks the eventual product domain. Distinctive subject tokens and explicit continuation language may reopen an existing conversation; the prompt is written only to the resolved target.

**Why:** A provider call is too slow and expensive for deterministic organization, while a keyword-only domain check is too shallow when terms overlap. Local indexed history is immediate, inspectable, and supplies labeled corrections for a future learned coordinator without making an untrained model authoritative.

**Prediction (check at this slice exit):** The six routing examples in Proposal 007 will pass deterministically, local reopen will make zero engine calls, and every worker call will receive history from the target conversation only.

## 2026-08-18 — Automatic non-sensitive profile memory

**Decision:** High-confidence incidental profile patterns such as name, stable preference, major, and stated long-term goal are committed directly to `will-private` with conversation provenance. Incidental health and finance facts remain review proposals; direct Remember commands remain immediate. Project continuity stays in its conversation cache rather than being flattened into global profile facts.

**Why:** Will explicitly prefers automatic useful memory with Correct/Forget afterward. Separating profile facts from project history prevents the global vault from becoming a copy of every chat and keeps retrieval bounded as records scale.

**Prediction (check at this slice exit):** A name statement will create one active profile memory and no proposal, a sensitive incidental statement will create a proposal and no memory, and coding requests will not become profile memories.

## 2026-08-18 — Bounded conversation history in worker prompts

**Decision:** Worker prompts include a local, target-conversation-only history pack capped by both message count and characters. Navigation-only and local-memory answers bypass workers entirely. No new dependency is added; SQLite and deterministic token matching are sufficient for this first coordinator baseline.

**Why:** The UI previously displayed persistent conversations without actually giving their earlier messages to the worker. A hard-bounded pack creates real continuity without dumping the vault or unrelated chats, and it remains fast at thousands of messages.

**Prediction (check at this slice exit):** Follow-ups can reference an earlier message in the same conversation, unrelated conversation text is absent from the prompt, and the history pack never exceeds its configured cap.

## 2026-08-18 — Coding conversations own isolated local project folders

**Decision:** A file-producing Coding request creates a conversation-owned folder under the local `GROVER Projects` root unless Will links an existing folder. The engine receives a distinct `project` execution mode with write access inside that folder. GROVER rejects any linked folder that is the GROVER repository, contains it, or sits inside it. The Coding domain remains unable to edit GROVER itself.

**Why:** Organizing a coding request into a Coding page is not functional if the worker remains read-only or points at GROVER's own source. A per-conversation root gives Codex the correct working directory, makes projects easy to find in Windows, and preserves the Builder security boundary without a new dependency.

**Prediction (check at this slice exit):** `Build a new coding platform` will create one project record and directory, invoke the engine in project-write mode with that directory as `cwd`, expose the path in the desktop UI, and reject an attempt to link the GROVER repository as a Coding project.

## 2026-08-18 — Abstract workload tiers map to configurable provider profiles

**Decision:** GROVER classifies non-local work as `fast`, `balanced`, or `frontier`, then looks up the selected engine's model and reasoning effort from SQLite configuration. The initial verified Codex mapping is fast → GPT-5.6 Terra/low, balanced → GPT-5.6 Terra/medium, frontier → GPT-5.6 Sol/high. Local navigation and memory answers bypass providers. Provider model names do not appear in context or application-domain routing rules.

**Why:** Will wants Sol/high for complex coding and a lighter model for routine work without making Codex the coordinator. Official OpenAI guidance describes Sol as the flagship complex-work tier and Terra as the balanced tier, and both exact profiles successfully answered through the signed-in bundled CLI on this computer. Storing mappings as data preserves the provider-neutral engine boundary.

**Prediction (check at this slice exit):** A short external Ask records the fast profile, ordinary Work records balanced, Coding writes and GROVER builds record frontier, Settings exposes the mappings, and the live isolated game build records and successfully invokes `gpt-5.6-sol` with high reasoning.

## 2026-08-18 — Learned manager trains behavior, not personal state

**Decision:** Under accepted PlanningProposal 008, the student receives bounded synthetic or runtime state and emits one short schema-constrained decision at a time. Personal memory, schedules, project contents, conversation history, permissions, and tool availability remain outside model weights in authoritative local storage.

**Why:** Training volatile or private state into weights would create staleness, deletion, privacy, and retraining problems. A small manager should learn how to retrieve and orchestrate state, while SQLite and the filesystem keep facts editable and disposable.

**Prediction (checked at this slice exit):** Dataset validation will find no real vault/database content, every gold reference will resolve within its synthetic state, and changing a memory or project record will require no retraining. **Result: confirmed across 23,715 synthetic records.**

## 2026-08-18 — Resource-bounded QLoRA training harness

**Decision:** Use the Apache-2.0 `Qwen/Qwen3-1.7B` student with pinned PyTorch, Hugging Face Transformers, PEFT, Accelerate, bitsandbytes, and JSON Schema dependencies for 4-bit QLoRA in an isolated Python 3.12 environment. The default 4 GB profile uses completion-only loss, sequence length 768, micro-batch one, gradient checkpointing, and at most two retained checkpoints. Model, workspace, and hyperparameters remain configurable.

**Why:** The current Windows device exposes an RTX 3050 Laptop GPU with 4 GB VRAM and about 37.5 GB free. Built-in Node/Python primitives cannot implement CUDA quantized adapter training, model tokenization, or resumable optimizer checkpoints. QLoRA keeps the trainable adapter and checkpoint footprint small enough for this machine while preserving a portable dataset for stronger hardware.

**Prediction (checked at this slice exit):** Preflight will identify the 4 GB profile, a tiny dry run will complete without GPU out-of-memory, interruption will resume from the latest checkpoint, and cleanup will preserve the base model, best/final adapter, datasets, reports, and no more than two checkpoints. **Result: confirmed; measured peak allocation was 3,654.5 MB and the resume smoke continued from checkpoint 2 to step 3 only.**

## 2026-08-18 — Family-isolated synthetic curriculum before live promotion

**Decision:** Generate task-specific stateful examples from reviewed semantic scenario families, assign family-level train/validation/test/review splits before paraphrase expansion, and measure each manager capability separately. Ambiguous, preference-sensitive, and consequential cases remain outside training until human-reviewed. The learned model stays offline/shadow-only until it beats the deterministic baseline and passes every boundary test.

**Why:** Random row splitting leaks near-duplicate synthetic paraphrases and produces misleading accuracy. Capability-specific schemas shorten training sequences, improve observability, and reveal whether routing, retrieval, memory, clarification, delegation, or recovery actually regressed.

**Prediction (checked at this slice exit):** The validator will report zero scenario-family overlap across splits, broad task/label coverage, a bounded review queue, exact-schema metrics per capability, and zero accepted unsafe side effects. **Result: confirmed; the final curriculum has 5,889 isolated families, zero exact or semantic cross-split leaks, 315 quarantined review cases, and strict per-capability promotion metrics.**

## 2026-08-18 — Everyday latency is a learned-manager promotion gate

**Decision:** Held-out evaluation measures generation latency separately for interactive manager modes and requires p95 at or below three seconds, in addition to accuracy and zero authority-boundary violations. A slow but accurate adapter stays offline; later work must optimize inference or train a smaller student rather than weakening the daily-use target.

**Why:** The manager exists partly to remove provider latency from routing, continuity, memory, clarification, and simple responses. Promoting a local model that takes many seconds per orchestration decision would make GROVER less practical even if its labels were correct.

**Prediction (check after the long run):** The final report will expose fast-path p95 explicitly; if the 4-bit Transformers runtime misses three seconds, status will be `complete_not_promoted` and no live routing integration will occur.

## 2026-08-19 — Double-click launchers retain visible feedback

**Decision:** Windows command wrappers pause after preparation, start, status, review, and reset actions so a double-clicked console cannot disappear before Will reads the result. The detached trainer remains independent of that launcher window. A dedicated stop-and-reset command terminates the complete recorded manager process tree and removes only its partial run before re-running preflight.

**Why:** The first real long-run start succeeded, but immediate console closure looked exactly like a crash. A visible outcome is required for a nontechnical desktop workflow even when the underlying process is intentionally hidden.

**Prediction (checked immediately):** A launcher smoke will display its result and wait for a key, while the already-running `manager-v1` process continues without interruption. **Result: confirmed.**

## 2026-08-21 — Persistent GGUF runtime for learned-manager inference

**Decision:** Evaluate checkpoint 750 through a pinned CUDA build of `llama.cpp`. Export the exact bitsandbytes NF4 base representation used in training, dequantize it to FP16, safely merge the LoRA, convert that merged model to GGUF, and then quantize it to Q8. The runtime stays warm, fully offloads the model to the NVIDIA GPU when supported, disables thinking, reuses the active slot's common prompt prefix, disables the unnecessary multi-prompt host cache, constrains structured output, and remains offline/shadow-only until accuracy, authority, and warm three-second gates pass. Downloaded binaries, models, and conversion sources live under the disposable local manager runtime rather than Git.

**Why:** The training-oriented Python/Transformers stack measured 16.24-second p95 inference on the laptop after checkpoint 750 achieved 90/90 exact held-out sample decisions. Built-in Node and Python primitives cannot execute a quantized Qwen model with CUDA, load a PEFT LoRA adapter, or provide persistent KV-cached inference. `llama.cpp` supplies those missing local primitives without adding a browser, hosted service, or provider dependency.

**Prediction (check at this slice exit):** The converted checkpoint will retain every sampled accuracy and authority result, materially reduce warm latency on the RTX 3050 laptop, and remain unintegrated if p95 exceeds three seconds or any decision changes. **Sample result:** confirmed on 90 held-out cases at 90/90 exact, zero authority violations, and 1.257-second p95. A standard Q8 base plus separate LoRA and an exact-merged Q4 candidate both failed accuracy and were rejected. Four-slot continuous batching also changed seven of its first 120 decisions and was rejected; this manager uses one deterministic slot. The first sustained run exposed and removed `llama-server`'s default 8 GB host prompt cache after it forced Windows paging; GROVER keeps only active-slot prefix reuse.

## 2026-08-21 — Authenticated native manager shadow boundary

**Decision:** With Will's explicit Trigger 5 approval, the Windows application may launch the pinned manager runtime as a hidden per-app process bound only to `127.0.0.1`. Every launch creates an in-memory 256-bit API key passed only through the child environment; the key, port, and raw inference API are never exposed through renderer IPC. The server disables its web UI and slot endpoint, rejects ordinary browser origins by allowlisting only the reserved `https://grover.invalid` origin, disables CORS credentials, and stops with the application. The model/runtime paths must resolve within the approved local inference folder and the model hash must match the manifest before launch.

**Why:** A warm process is required for the measured one-to-three-second response time, but an unauthenticated wildcard-CORS listener would let arbitrary browser content invoke the local model. Backend-only authenticated loopback access preserves native-app performance without LAN or renderer exposure.

**Prediction (checked at this slice exit):** Unit checks will prove the key is absent from process arguments, loopback and restrictive CORS flags are fixed, malformed manager output fails closed, and shadow records cannot alter routing. A live desktop smoke will show a ready manager and an audited shadow decision while the existing deterministic route remains authoritative. **Result: confirmed.** The real Windows app launched the verified Q8 manager, displayed `Shadow ready`, completed an authenticated route in 583 ms, retained General as the authoritative context, wrote only a request hash plus decision evidence to the shadow audit, and terminated the hidden server with the app.

## 2026-08-21 — Bounded continuity shadow candidates

**Decision:** Extend the authenticated manager shadow with the trained continuity task. GROVER's local FTS index supplies at most eight candidate conversations containing IDs, titles, contexts, project IDs, and active status; the current conversation/project is included even when a generic follow-up has no searchable subject words. The model may reference only those IDs. Its proposal is audited after the route shadow but cannot create, reopen, branch, navigate, or select a project.

**Why:** The learned manager needs realistic state to distinguish a new project from “continue this one” or “reopen the existing tic-tac-toe project,” but sending complete history would raise latency, storage, and prompt-injection exposure. A small deterministic shortlist lets the model resolve language while local storage and validators retain authority.

**Prediction (checked at this slice exit):** Tests will reject invented IDs, preserve the existing deterministic reopen behavior, cap candidate state, and avoid raw history content. The real laptop will keep the visible deterministic response under one second while route plus continuity run asynchronously; learned decisions remain shadow-only unless their own throttled-state latency later meets the three-second promotion gate. **Result: confirmed.** The live app displayed its local greeting in 78 ms, branched to Coding in 68 ms, and completed authenticated route plus continuity shadow inference in 1.837 seconds. A same-family 0.6B speculative draft was tested and rejected because its extra 0.8 GB raised per-case latency to roughly six seconds on the 4 GB GPU; the draft and incomplete benchmark were deleted.

## 2026-08-21 — Local warm-start for retrieval shadow

**Decision:** Invoke the trained retrieval task only when local indexes found relevant state or the request explicitly calls for recall, project progress, scheduling, continuation, or audit. GROVER supplies at most eight locally ranked conversations, projects, and memories per type. Conversation history is represented by title and stable IDs; memory candidates carry a 160-character relevant summary inside the authenticated local process. The durable audit stores only candidate IDs and a request hash. Every selected or untrusted ID must be present in the supplied candidates.

**Why:** Searching all history inside the model would be slow, unbounded, and impossible to authorize safely. Deterministic FTS is the fast recall mechanism; the learned manager's job is to choose the minimum useful subset and request another bounded search when the warm start is insufficient.

**Prediction (checked at this slice exit):** Tests will cap each candidate type, reject invented retrieval IDs, keep raw vault text out of the shadow audit, and preserve deterministic conversation behavior. A live existing-project request will reopen immediately while retrieval finishes asynchronously without creating a duplicate conversation. **Result: confirmed.** Seventy-two deterministic checks pass. In the live post-stress smoke, the existing tic-tac-toe conversation reopened in 68 ms with no duplicate and the route, continuity, and retrieval outputs all validated. The throttled three-stage shadow chain took 24.58 seconds, so it remains non-authoritative; this result is evidence against putting the full chain on the visible critical path.

## 2026-08-21 — Resume uses the checkpoint's recorded training profile

**Decision:** When a resumable checkpoint exists, training pins LoRA rank, sequence length, accumulation, and evaluation limits from that run's manifest rather than selecting a new profile from the destination GPU. Fresh runs still select a hardware-appropriate profile automatically.

**Why:** Checkpoint 750 was trained as rank 8 under the 4 GB profile. Automatically selecting rank 16 on an 8 GB desktop changes adapter tensor shapes and cannot represent an exact continuation, even though the stronger GPU has more capacity.

**Prediction (check immediately):** Moving checkpoint 750 to the 2060 Super will build the original rank-8 model and restore its optimizer state, while a fresh run on that computer will still select the 8 GB profile. **Mechanical result:** profile-selection coverage confirms a moved checkpoint pins rank 8 while a fresh 8 GB run selects rank 16; an actual 2060 Super resume remains optional.

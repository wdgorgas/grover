# GROVER — next functional handoff

## Current truth

- Native Windows desktop application; portable RC.3 exists and has passed its prior live smoke.
- General can branch into Coding, reopen an existing project conversation, and use bounded local memory.
- The local manager is accurate and safety-bounded, but its complete chain measured 6.1792-second sustained p95 on this laptop. It is therefore shadow-only; deterministic local behavior remains authoritative and typically appears in 68–104 ms.
- Visual redesign is intentionally deferred.
- Local `master` is ahead of the remote. Do not disturb the pre-existing deletion of `JACKSON_START_HERE.md`.

## Next objective: everyday reliability and control

The immediate goal is not another manager capability or a niche sub-application. Finish the general-purpose project and memory foundation so Will can use GROVER to build those applications from inside GROVER:

1. **Codex-first provider readiness.** Codex is the normal execution engine because Will does not expect to maintain a Claude subscription. Auto must choose Codex whenever Codex is ready and must never attempt an unavailable Claude installation/session. Keep Claude behind the provider-neutral adapter as an optional future switch/checker. Convert provider failures into a clear in-app recovery action rather than a raw error code.
2. **Project memory integrated with the vault.** Give every project a durable identity and automatically maintained, provenance-backed record of its goal, current state, important decisions, outputs/artifacts, verified outcomes, and next actions. Link those records to the project and conversation instead of mixing them with global profile facts. Retrieve the exact project's bounded memory before a worker starts; never send the whole vault.
3. **Memory lifecycle and scale.** Auto-write verified operational project facts and direct “remember this” requests; keep sensitive incidental facts reviewable. Add project-scoped correction/supersession/archive controls, asynchronous consolidation, conflict handling, and retention rules for short-term conversation/cache material. Preserve the Markdown vault as the human-readable durable layer and SQLite/FTS as the fast index.
4. **Conversation and project control.** Build archive/rename/restore, project navigation, and a clear project summary around the same project-memory identity. Keep project history separate from General. Do not implement permanent deletion without an explicit destructive-action policy/confirmation.
5. **Package the next candidate.** Run the complete regression and real Electron smoke, then produce a fresh portable Windows executable with a short launch/readme handoff.

## Manager strategy

Keep route, continuity, and retrieval in authenticated local shadow mode. Collect real disagreements from these workflows. If one learned task proves valuable, optimize or distill that task alone; do not put the full manager chain in front of every prompt until it meets the three-second sustained-latency gate.

## Verification required for every slice

- Deterministic tests for the policy and data behavior.
- Rendered Electron evidence for the visible flow.
- Restart/persistence proof for project identity, history, goals, decisions, outputs, and memory.
- A worker receives the target project's relevant memories and bounded conversation history, while unrelated projects and global vault contents remain absent.
- Completed work writes a provenance-backed outcome/artifact summary that can later answer “what happened with this project?” locally.
- No raw provider error, vault text, or untrusted candidate content in durable activity/audit views.
- Preserve the fast local path for greetings, navigation, current-project continuation, and exact recall.

## Explicitly later

- Visual redesign and memory graph.
- Lifestyle scheduling and other niche/domain sub-applications; GROVER should be able to build these after the general project/memory foundation is usable.
- Remote calendar/account synchronization and any server deployment.
- Full-manager promotion or another broad training run.
- Permanent deletion controls until the destructive-action policy is agreed.

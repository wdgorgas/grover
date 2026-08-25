# GROVER — next functional handoff

## Current truth

- Native Windows desktop application; portable RC.3 exists and has passed its prior live smoke.
- General can branch into Coding, reopen an existing project conversation, and use bounded local memory.
- The local manager is accurate and safety-bounded, but its complete chain measured 6.1792-second sustained p95 on this laptop. It is therefore shadow-only; deterministic local behavior remains authoritative and typically appears in 68–104 ms.
- Visual redesign is intentionally deferred.
- Local `master` is ahead of the remote. Do not disturb the pre-existing deletion of `JACKSON_START_HERE.md`.

## Next objective: everyday reliability and control

The immediate goal is not another manager capability. Make the daily workflow reliable enough that Will can use GROVER and report real UX friction:

1. **Provider readiness and recovery.** Show one honest status for Codex/Claude/Auto, make the usable sign-in action discoverable, and ensure Auto never selects an unavailable provider. Convert provider failures into a clear in-app recovery action rather than a raw error code.
2. **Conversation and project control.** Add non-destructive archive/rename/restore and a clear way to reopen or move between projects. Keep project history separate from General. Do not implement permanent deletion without an explicit destructive-action policy/confirmation.
3. **Lifestyle scheduling, local first.** Add a minimal local schedule store: create an appointment, view today, edit/archive an item, and answer “what do I have today?” without model inference. Calendar-provider sync is later.
4. **Package the next candidate.** Run the complete regression and real Electron smoke, then produce a fresh portable Windows executable with a short launch/readme handoff.

## Manager strategy

Keep route, continuity, and retrieval in authenticated local shadow mode. Collect real disagreements from the three workflows above. If one learned task proves valuable, optimize or distill that task alone; do not put the full manager chain in front of every prompt until it meets the three-second sustained-latency gate.

## Verification required for every slice

- Deterministic tests for the policy and data behavior.
- Rendered Electron evidence for the visible flow.
- Restart/persistence proof for any history or scheduling data.
- No raw provider error, vault text, or untrusted candidate content in durable activity/audit views.
- Preserve the fast local path for greetings, navigation, current-project continuation, exact recall, and daily schedule lookup.

## Explicitly later

- Visual redesign and memory graph.
- Remote calendar/account synchronization and any server deployment.
- Full-manager promotion or another broad training run.
- Permanent deletion controls until the destructive-action policy is agreed.

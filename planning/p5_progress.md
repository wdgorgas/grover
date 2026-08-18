# P5 progress — hardening and recovery

Mechanical P5 exit completed on 2026-08-18 under accepted PlanningProposal 006. This closes the functional implementation passes; Will's hands-on UX confirmation and new visual direction remain the final product-acceptance work.

## 2026-08-18 — hardening drills green

**What changed:** Added the exact five-rule PolicyRegistry and event-audited decisions, deterministic direct-approval boundaries, hard-cap block evidence, atomic kill-switch audit events, untrusted-content filtering and prompt labeling, integrity manifests for memory backups, verified restore with a pre-restore safety backup, backup-health warnings, durable recovery cards, and recovery-card rendering in conversations. Settings exposes the five read-only approval boundaries. Memory exposes backup health and restore.

**What I verified:** 51/51 deterministic tests pass. P5 tests deliberately provoke all five sign-off triggers, stop queued and active work, block a budget breach before an engine call, exclude a hostile external-memory instruction, restore exact memory state and detect tampering, and force rendered-browser verification to fail. That deliberate failure preserves the edit and records changed files, revert state, collected evidence, cost, and the next safe action. The existing crash/restart drill now also asserts a durable recovery card. Electron smoke passes with five policy rules rendered and no document reload.

**What is still open:** Let Will exercise the packaged functional workflow. The visual/orb pass remains intentionally deferred for Will's new direction.

**What the next person should do:** Use the packaged app for ordinary questions, a Coding project, a GROVER Builder change, memory remember/correct/delete/backup, pause/cancel, and agent sign-in. Record UX friction as functional defects before beginning the visual redesign.

**Risks or weirdness:** External account actions and server deployment remain disconnected by design. Policy classification is deterministic and intentionally narrow; uncertain or implied boundary actions must pause rather than generalize. A failed restore marks backup health non-green until a new valid backup and restore drill pass.

## 2026-08-18 — packaged functional candidate

**What changed:** Versioned the finished functional scope as `2.0.0-rc.1` and built the single-file portable Windows application with the native Codex runtime embedded.

**What I verified:** The exact portable file answered a live request through bundled Codex. The RC source then passed the deterministic suite, rendered desktop smoke, live Ask, live restart-backed memory recall, and the full four-case live Builder reliability suite. Artifact details are recorded in `planning/functional_candidate_handoff.md`.

## 2026-08-18 — RC.2 profile-greeting repair

**What changed:** Fixed auxiliary memory, budget, and policy audit events so their internal domains cannot replace a task's application context. Added reducer replay coverage, a core regression for `hey grover my name is will`, and a rendered desktop assertion.

**What I verified:** 53 deterministic checks pass. The exact greeting passes through live Codex in source and through the packaged RC.2 executable with bundled Codex. It remains in General and produces one reviewable memory proposal instead of crashing before the engine call.

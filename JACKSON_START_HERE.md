# Jackson — start here

Welcome. This file gets you and your Claude instance productive in one session, **without needing Will online**. Everything below is runnable solo; your work lands in the repo and Will picks it up when he's back.

## What this project is (30 seconds)

GROVER is a private AI command center Will is building (you'll share it eventually). v1 got built, cost ~$70, and was retired: real engineering underneath, but no live feedback, dead controls, contradictory statuses, generic sci-fi visuals. v2 is a spec-first full rebuild.

The spec was produced by a seven-iteration adversarial loop: Will's Claude and his ChatGPT attacked each other's proposals until they converged, with Will relaying files and making the human calls. You run the same kind of Claude+ChatGPT pair for your own lanes.

## Where things stand (updated 2026-07-03 — planning complete)

**The iteration cycle is finished.** Seven iterations, zero unresolved disagreements. The result is **`planning/grover_v2_master_prompt.md`** — the final, sole binding build specification (14 sections: architecture, evidence policy, governance, cost, memory, phases P0–P5).

**What has NOT happened yet: Will's formal green light.** Approving the master prompt is the P0 exit, and it's his alone. Until he gives it, nobody writes v2 application code — not you, not any Claude instance. Your window: everything you produce before the green light shapes the build cheaply; after it, changes go through formal proposals against a moving target.

## Your setup (once)

1. Accept Will's GitHub invite, then: `git clone https://github.com/wdgorgas/grover.git`
2. Open the cloned folder in the Claude desktop app (Cowork) as your working folder.
3. Tell your Claude instance, verbatim:

> Read JACKSON_START_HERE.md, then README.md, then planning/grover_v2_master_prompt.md (the binding spec), then planning/grover_v2_handoff.md, then planning/PLANNING_BOARD.md. The iteration files in planning/chatgpt_handoffs/ and the scope doc are the planning record — consult them for rationale, but the master prompt overrides them everywhere. Then summarize the current state and my active assignment back to me before doing anything.

That's the whole onboarding. Your Claude will know everything it needs.

## Your next steps, in priority order — all runnable while Will is offline

### Step 1 — Red-team the final master prompt

Highest value first: read `planning/grover_v2_master_prompt.md` cold — fresh eyes are the point; you're the only human who hasn't been staring at it. Hunt for: internal contradictions, any "must" a builder could satisfy in letter but violate in spirit, v1 failure modes that could still sneak through, and unwritten assumptions (v1 died from what nobody wrote down). Then run it through your ChatGPT independently before comparing notes with your Claude — two cold reads beat one.

Output: `planning/chatgpt_handoffs/jackson_01_redteam_master_prompt.md`. Any finding that proposes a spec change must be written in the proposal format from master prompt §12 (`proposal_id`, `area`, `affected_decisions`, `conflicts_with_locked_decisions`, `requires_will_decision`, ...). You cannot edit the spec — nobody can except through §12; Will arbitrates proposals when he's back.

### Step 2 — UI/UX spec track

The master prompt defines UI *requirements* (§10: live transparency, token theming, recovery cards, draggable task widgets, taste anchors) but deliberately not the actual design. That design is yours: visual direction, theme token system, Command Center + Builder view layout, how the orb integrates. Locked constraints: Linear/Arc/Things/Raycast taste; no Iron-Man HUD, glowing circuits, or generic dark-SaaS AI chrome; the particle orb carries over exactly as-is (`archive/grover_v1/client/js/orb.js`); §10's v2.0 scope guard applies — design the v2.0 surfaces, not future modules. References in `design/`.

Output: `planning/chatgpt_handoffs/jackson_02_uiux_spec.md` (§12 proposal format for anything that would change spec text). This lands best if it's ready when Phase 1 (SPA shell + orb port) starts.

### Step 3 — Acceptance-test catalog

Expand master prompt §5 + §13 (evidence matrix, phase exits, P5 hardening drills, the ten memory tests, the no-migration test) into one numbered, runnable checklist — the document Will uses to verify each phase before money flows to the next. Output: `planning/acceptance_test_catalog.md`.

### While Will is offline — do NOT

- Start building v2 (the green light is his, full stop).
- Edit `planning/grover_v2_master_prompt.md`, the handoff doc, or the scope doc (proposals only, per §12).
- Add `iter_NN` files to `planning/chatgpt_handoffs/` — the main iteration thread is closed.
- Reopen locked decisions (list in `planning/PLANNING_BOARD.md`).

### When Will returns

He reviews your proposal files, accepts/rejects each per §12 (rejections must cite what they conflicted with), then formally approves the master prompt — the P0 exit. Then the build starts, and your ongoing roles kick in: proposal-based UI input as it gets built, second pair of eyes on phase-exit evidence, and P5 drill participation (some drills — like proving `jackson-private` fails closed — are literally about you).

## Your working loop (every session)

1. `git pull` (always first).
2. Check `planning/PLANNING_BOARD.md` — claim your workstream by putting your name on it and pushing.
3. Work with your Claude. When it produces a draft worth challenging, hand the file to your ChatGPT with this framing:

> You are reviewing planning output for GROVER v2. The binding spec is the attached master prompt; the other attachment is a proposal from Claude. Attack weak reasoning, check it against the spec and its locked decisions, and reply per-section with agree/disagree/modify + reasoning. Planning only, no code. Flag anything that needs a human decision.

4. Bring ChatGPT's reply back to your Claude; iterate until they converge or the disagreement needs Will (mark it `requires_will_decision: true` and move on).
5. Commit and push (exact commands in `GIT_SETUP.md`). Push the same day you work — unpushed work is invisible.

## Rules that keep us from stepping on each other

- Your files are `jackson_NN_<topic>.md` in `planning/chatgpt_handoffs/`, plus `planning/acceptance_test_catalog.md`. Touch nothing else in `planning/`.
- **`archive/` is read-only** (v1 reference). Never commit anything under `archive/grover_v1/data/` or `vault/` — secrets live there and they're gitignored; if `git status` ever shows them, stop and tell Will.
- Git runs on your machine, not inside Claude's sandbox — your Claude prepares files and tells you the commands (`GIT_SETUP.md`).
- **Always check `git branch` shows `* master` before committing** — this exact mistake already ate an evening.

## Context worth knowing

- Your private space in GROVER is one of the five sign-off triggers: nothing touches `jackson-private` without explicit approval, and in v2.0 it fails closed entirely.
- Your own GROVER login is deferred past v2.0 (real multi-user needs server deployment) — you're a co-planner now, a user later.
- ChatGPT's role is adversarial reviewer, not co-author of record — its accepted points get merged through proposals, and human decisions are Will's.

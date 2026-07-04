# Jackson — start here

Welcome. This file is meant to get you productive in one session, without needing Will online.

The short version: you are not a backup reviewer. You are a build partner. The goal is simple: pull the repo, understand the current phase, do the next useful thing, verify it, push it, and leave a clear handoff so Will or another Claude session can continue.

Will still owns final product direction and final calls when something affects scope, safety, cost, privacy, or visual taste. But day-to-day progress should not wait on ceremony. If a task is already within the approved spec and phase, move it forward.

---

## 1. What GROVER is

GROVER is a private, professional-grade AI command center shared with you.

It is not meant to be a normal chatbot. It is an operating layer for building, memory, project management, cost control, and eventually domain-specific work like research, coding, business, quant, home tech, and personal systems.

v1 was retired because it had real engineering underneath but failed as a product:

- work happened invisibly;
- controls existed but did not actually control anything;
- task status contradicted itself;
- the UI could reload or lie while claiming progress;
- server-side checks passed while the rendered app still felt broken;
- the look drifted into generic sci-fi / AI-dashboard territory.

v2 exists to prevent those failures structurally, not just by hoping Claude remembers them.

---

## 2. The current authority

The binding build spec is:

`planning/grover_v2_master_prompt.md`

That file supersedes the draft, the planning iterations, the old scope doc, and v1's master prompt. Older files are useful for rationale only. If they conflict with the final master prompt, the final master prompt wins.

The build is organized into phases P0–P5. Each phase has exits and budget guards. The next phase should not begin until the current one is green.

The basic v2.0 target is only:

1. Builder works visibly end to end.
2. Minimal memory core works.

Everything else is future scope unless the master prompt says it is needed for v2.0.

A repo-root `CLAUDE.md` exists as the session contract for any Claude instance working in this repo — it encodes the bootstrap ritual, verification rules, and boundaries so you don't have to re-teach them each session.

---

## 3. Your role

You are a partner builder.

Your job is to help get the current phase done cleanly. That may mean implementing, reviewing, testing, documenting, fixing, or pushing the repo forward. The useful work is whatever the phase currently needs most.

There is no rigid Team A / Team B split. We are assuming we usually will not be working at the exact same time. The workflow is closer to a relay:

```text
Pull latest
→ see what phase/task is open
→ take the next useful slice
→ build or verify it
→ commit/push
→ leave a handoff
→ next person continues
```

If you can get P1 or another phase slice across the line before Will can, do it, as long as it stays inside the approved spec and leaves a clean audit trail.

Will keeps final product-owner authority for decisions that change the spec, scope, taste direction, cost/security boundaries, Jackson-private boundaries, or phase exit criteria. But routine implementation and verification inside the current phase should move.

---

## 4. Setup

1. Accept Will's GitHub invite.
2. Clone the repo:

```bash
git clone https://github.com/wdgorgas/grover.git
cd grover
```

3. Open the repo in Claude Desktop / Claude Code / Cowork.
4. Tell Claude:

```text
Read CLAUDE.md, then JACKSON_START_HERE.md, then README.md, then planning/grover_v2_master_prompt.md, then planning/PLANNING_BOARD.md, then any current phase handoff/progress files. The final master prompt is binding. Older planning docs are rationale only. Summarize the current phase, current repo state, and the next useful task before making changes. Read my current environment state, see if anything needs to be installed (GitHub, correct directories...), and guide me through it simply.
```

---

## 5. Every-session workflow

Start every session from the repo root:

```bash
git pull
git status
git branch
```

Then check:

- `planning/grover_v2_master_prompt.md`
- `planning/PLANNING_BOARD.md`
- any phase progress file or latest handoff
- recent commits:

```bash
git log --oneline -8
```

Then choose the next useful slice. Prefer small, verifiable work.

Before changing files, make a branch unless the repo instructions say a branch already exists for the current phase:

```bash
git checkout -b phase-pX-short-description
```

Examples:

```bash
git checkout -b phase-p1-event-spine
git checkout -b phase-p1-reload-detector
```

When done:

```bash
git status
# run whatever verification applies
# e.g. npm run verify, tests, Playwright smoke, etc.
git add -A
git commit -m "Clear description of completed slice"
git push -u origin HEAD
```

Then leave a short handoff in the repo or PR/commit message:

```text
What changed:
What I verified:
What is still open:
What the next person should do:
Any risks or weirdness:
```

---

## 6. How to decide what to work on

Work from the current phase, not personal preference.

The rough order is:

1. Anything blocking the current phase exit.
2. Anything that verifies the app cannot repeat a v1 failure.
3. Anything that makes the next Builder slice safer.
4. Documentation/handoff only when it prevents confusion or protects future work.

Do not build future modules just because they are interesting. Research Desk, Income Lab, Quant, Health, Morning Briefing, Media/Home, Voice/Hardware, broad personal memory, and multi-user deployment are not v2.0 unless the final prompt explicitly says a seam/test is needed.

---

## 7. P0 status

**P0 is approved.** Will approved the master prompt on 2026-07-03; it's recorded on `planning/PLANNING_BOARD.md`. The build is green-lit and P1 (spine skeleton) is the open phase.

You may still improve repo organization, planning-board clarity, acceptance-test documents, or proposal intake whenever they'd prevent confusion — that's always in-scope. Record phase transitions on the board so a fresh Claude session can begin work without hunting through chat history.

---

## 8. Communication through the repo

The repo is the shared memory between Will, you, and the Claude sessions.

Use it. Do not rely on private chat context.

For any meaningful work, leave one of these:

- a commit message that explains the slice;
- a short phase handoff;
- an update to `planning/PLANNING_BOARD.md` if the status changed;
- a `PlanningProposal` if something would change scope/spec/phase exits.

Good handoff:

```text
P1 reload detector scaffolded. Added test helper and one failing test proving reloads are detected. Did not wire it into full Playwright suite yet. Next: integrate into golden-path smoke and make the test pass against the SPA shell.
```

Bad handoff:

```text
Worked on tests. Seems good.
```

---

## 9. When to use ChatGPT

Use ChatGPT as a hard reviewer when the output affects architecture, tests, acceptance rules, UI direction, or phase exits.

Prompt it like this:

```text
You are reviewing GROVER v2 work. The binding spec is planning/grover_v2_master_prompt.md. Review the attached proposal/diff/handoff against the spec. Be adversarial. Look for contradictions, v1 failure modes, unverifiable claims, scope creep, and weak acceptance tests. Reply with agree / modify / reject and exact fixes where possible.
```

You do not need ChatGPT for every small code edit. Use it when a mistake would be expensive or would become a hidden assumption.

---

## 10. Proposal rules

Do not edit the final master prompt directly.

If you find something that should change the spec, create a proposal using the master prompt §12 structure:

```text
proposal_id:
source_file:
proposer:
status: proposed
area:
affected_decisions:
summary:
acceptance_implications:
conflicts_with_locked_decisions:
requires_will_decision:
resolution:
```

Spec-changing work waits for Will.

Implementation work inside the approved spec does not need a proposal.

---

## 11. Boundaries that always matter

Even as a partner builder, some things are not casual:

- Do not touch `jackson-private`; in v2.0 it fails closed entirely.
- Do not expose secrets, vaults, API keys, or ignored files.
- Do not change auth/security/tool allowlists/kill switch/audit behavior without explicit sign-off.
- Do not spend or raise budgets without explicit approval.
- Do not force-push or rewrite history unless Will explicitly approves it.
- Do not directly commit to `main`/`master` except final verified merges if the repo process allows it.
- Do not use v1 code as authority. v1 is reference only, except where the final prompt explicitly says to port something, such as the orb.

If unsure whether something is implementation detail or policy/scope change, pause and write the smallest concrete question.

---

## 12. Visual direction

Don't own visual direction without communication. Will wants to take that up directly with Claude Design himself. If you have ideas, share them with him.

The locked visual constraints still matter:

- keep the orb behavior/identity from v1;
- avoid Iron-Man HUD / glowing circuit / generic AI-dashboard styling: this isn't a 2010s hacker movie;
- aim for modern, smooth, professional, industry-grade, human, restrained UI;
- use semantic theme tokens from day one;
- live Builder transparency must be front and center.

If you work on UI, focus on making the Builder trustworthy and readable before making it fancy.

---

## 13. Practical first tasks

Pick based on current repo state. Good early tasks usually include:

- turning phase exits into a runnable checklist (`planning/acceptance_test_catalog.md`);
- scaffolding the event/projection schema;
- implementing or testing the reload detector;
- setting up Playwright smoke evidence;
- implementing evidence asset storage;
- writing the projection rebuild test;
- verifying that stub lanes are real and restricted;
- checking that the kill switch actually blocks queued/in-progress work.

Avoid giant slices. A good contribution is something another person can verify and continue from.

---

## 14. Merge attitude

The goal is not to protect personal branches. The goal is to get GROVER built.

If you finish a clean, verified slice, push it. If the repo uses PRs, open one. If Will has told you direct merges are okay for the current phase, merge after verification and leave the handoff.

Because we usually will not be working simultaneously, the main collision prevention is simple:

```bash
git pull
# work small
git status
# verify
git commit
git push
```

If you see new commits before pushing, pull/rebase carefully and re-run verification.

---

## 15. North star

GROVER should become something we can manage through GROVER itself: a trustworthy Builder, memory, cost governor, evidence system, and eventually domain managers.

Your role is to help make that real, not to wait on the sidelines.

Push the project forward. Keep it verifiable. Leave the repo better and clearer than you found it.

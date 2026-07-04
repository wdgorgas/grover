# Jackson — start here

Welcome. This file gets you and your Claude instance productive in one session. Will's workflow and yours are identical by design.

## What this project is (30 seconds)

GROVER is a private AI command center Will is building (you'll share it eventually). v1 got built, cost ~$70, and was retired: real engineering underneath, but no live feedback, dead controls, contradictory statuses, generic sci-fi visuals. v2 is a spec-first full rebuild. **Right now the project is planning only — nobody writes app code until the master prompt is done and Will green-lights the build.**

The planning method: a Claude instance and a ChatGPT instance argue each other toward the best architecture, with a human relaying files between them. Will runs one Claude+ChatGPT pair; you run another. This repo is how the four AIs and two humans stay in sync.

## Your setup (once)

1. Accept Will's GitHub invite, then: `git clone https://github.com/wdgorgas/grover.git`
2. Open the cloned folder in the Claude desktop app (Cowork) as your working folder.
3. Tell your Claude instance, verbatim:

> Read JACKSON_START_HERE.md, then README.md, then planning/grover_v2_handoff.md, then planning/grover_v2_scope_understanding.md, then every file in planning/chatgpt_handoffs/ in numeric order, then planning/PLANNING_BOARD.md. Then summarize the current state and my active assignment back to me before doing anything.

That's the whole onboarding. Your Claude will know everything Will's Claude knows.

## Your working loop (every session)

1. `git pull` (always first — Will may have pushed).
2. Check `planning/PLANNING_BOARD.md` for your assignment. Your suggested first one: **workstream 2, the UI/UX spec track** (visual direction, theme tokens, Command Center/Builder layout). Claim it by putting your name in the board and pushing.
3. Work with your Claude. When it produces a draft worth challenging, hand the file to your ChatGPT with this framing:

> You are co-planning GROVER v2. Attached is a proposal from Claude. Proofread it, attack weak reasoning, suggest improvements, and reply per-section with agree/disagree/modify + reasoning. Planning only, no code. Flag anything that should be a human decision rather than settled between AIs.

4. Bring ChatGPT's reply back to your Claude; iterate until they converge or the disagreement needs Will.
5. Save outputs to the location listed on the board (e.g., `planning/chatgpt_handoffs/jackson_01_uiux_spec.md`).
6. Commit and push (exact commands in `GIT_SETUP.md`). Push the same day you work — unpushed work is invisible.

## Rules that keep us from stepping on each other

- **Don't touch the `iter_NN` files** in `planning/chatgpt_handoffs/` — that's the main thread, owned per the board. Your files are `jackson_NN_<topic>.md`.
- **Don't edit the scope doc or handoff doc directly** — propose changes in your output files; the main thread merges them.
- **`archive/` is read-only** (v1 reference). Never commit anything under `archive/grover_v1/data/` or `vault/` — secrets live there and they're gitignored; if `git status` ever shows them, stop and tell Will.
- **Locked decisions** (in `planning/PLANNING_BOARD.md`) are settled — don't relitigate them; spend your energy on open questions.
- Git runs on your machine, not inside Claude's sandbox — your Claude prepares files and tells you the commands (`GIT_SETUP.md` § Daily workflow).

## Context worth knowing

- Your private space in GROVER is one of the five sign-off triggers: nothing touches `jackson-private` without explicit approval, and in v2.0 it fails closed entirely.
- Your own GROVER login is deferred past v2.0 (real multi-user needs server deployment) — you're a co-planner now, a user later.
- Taste anchor for the UI/UX track: Linear / Arc / Things / Raycast — artistry, modern, smooth, human. Explicitly rejected: Iron-Man HUD, glowing circuits, generic dark-SaaS AI chrome. The particle orb is untouchable — it carries over exactly as-is. References live in `design/`.

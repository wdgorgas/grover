# AGENTS.md — session contract for building GROVER v2

You are a Codex session working in the GROVER repo. This file is your standing contract for the **development stage**. It binds every session regardless of who launched it (Will or Jackson) or which client (Codex, Cowork, Desktop).

## Authority

1. `planning/grover_v2_master_prompt.md` is the **binding spec**. Its §14 governs anything it doesn't cover: ask the human for scope/policy/security/cost/privacy/visual-identity decisions; derive-and-record (in `DECISIONS.md`) for low-level implementation details; never import hidden requirements from `archive/grover_v1/`, old planning files, or model memory.
2. This file governs *how sessions work*, not *what gets built*. If it ever conflicts with the master prompt, the master prompt wins.
3. Current phase and status live in `planning/PLANNING_BOARD.md`. **P0 is approved (2026-07-03); P1 is open.**

## Session bootstrap (do this before any changes, every session)

1. `git pull`, `git status`, `git branch` — confirm clean start and know where you are.
2. Read `planning/PLANNING_BOARD.md` + the latest phase handoff/progress notes.
3. `git log --oneline -8` — see what the last sessions did.
4. Once the app exists: start it and run the golden-path smoke via browser before touching anything new (master prompt §11.2).
5. State the current phase, repo state, and your chosen slice in plain language **before** editing files.

## Work discipline

- **One small increment at a time.** A good slice is something the next person can verify and continue from. No giant slices, no cross-phase wandering.
- **Branch per slice:** use `phase-pX-short-description` for phase implementation and `review/short-description` for cross-cutting review/documentation work. Direct commits to `master` are only final verified merges.
- **Verify before you claim.** Nothing is "done" on your say-so: UI work needs rendered-browser evidence (Playwright: DOM assertion + screenshot); backend work needs test output; claims without artifacts are not completion (master prompt §3.6, §5).
- **Maker/checker pass before committing:** after a slice compiles/passes, re-review the full diff against the current phase exit with fresh eyes — a subagent with clean context if available, otherwise an explicit self-review step stated in plain language. Look for: v1 anti-patterns (§3), scope creep, unverifiable claims, missed evidence.
- **Checkpoint and hand off:** descriptive commit, progress-file update, and the five-line handoff — What changed / What I verified / What is still open / What the next person should do / Any risks or weirdness.
- **Prediction discipline:** any change to prompts, tools, skills, or this harness gets a `DECISIONS.md` entry with a one-line prediction, checked at the next phase exit (master prompt §11.6).
- **No new dependencies** without a `DECISIONS.md` entry explaining why a built-in primitive was insufficient (§11.8).

## Boundaries (non-negotiable in every session)

- Never read/write/export `jackson-private` — it fails closed in v2.0.
- Never expose or commit secrets: `archive/grover_v1/data/`, `vault/`, any `secrets.json` or key material. Check `git status` output before every commit.
- Never change auth, security, tool allowlists, kill-switch, or audit behavior without explicit human sign-off (Trigger 5).
- Never spend money or raise budgets without explicit approval (Trigger 1); phase budgets are $25 soft / $50 hard.
- Never force-push or rewrite history without Will's explicit approval.
- Spec changes go through §12 `PlanningProposal` records — never direct edits to the master prompt.
- If you cannot tell whether something is implementation detail or a policy/scope change: stop, write the smallest concrete question, surface it (§14.5).

## Environment notes

- **Cowork with a mounted folder:** do not run any git operation inside the sandbox — even read-only commands have corrupted lock/index state. Prepare files with file tools and give the human exact git commands to run on the host. In Codex on a normal local checkout, git works normally.
- Always confirm `git branch` before committing — a v1 leftover branch once swallowed a whole evening's commit.
- `UPDATE_REPO.cmd` at root is a spent one-time migration script; if it still exists, it's safe to delete.

## Output style

Plain-language progress first, then the work, then the verification plan and evidence. Never invisible work — the human following along should always know what you're doing, where, and how they'd check it.

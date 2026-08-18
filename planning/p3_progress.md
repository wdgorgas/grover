# P3 progress — Builder reliability set

Phase completed mechanically on 2026-08-18 under accepted PlanningProposal 006. Budget guard remained $25 soft / $50 hard; live Codex CLI runs reported $0 metered cost to GROVER.

## 2026-08-18 — five-case reliability exit

**What changed:** Builder requests inside the GROVER workspace now promote `Create` requests into real BuildRuns. UI-file changes automatically add a `ui_interaction` acceptance check and cannot close without an outside-sandbox `test:desktop` run, DOM evidence, and screenshot. App restart converts queued/running/verifying builds to paused recovery state. `jackson-private` requests fail closed before routing or FeatureRequest creation. Builder prompts reserve GUI verification for GROVER's verifier so Electron cannot hang inside the engine sandbox.

**What I verified:** `npm run test:builder-reliability` passed four live Codex Builder cases: UI-only, backend, setting/control, and persistent project state. Every case produced a dedicated branch, tests, evidence, commit, clean worktree, and receipt. The UI case additionally produced DOM and screenshot evidence. A fifth `jackson-private` case was refused before any engine or BuildRun. The fixture's accumulated regression suite passed after all four changes. A deterministic restart test proves an interrupted build reopens paused with branch/next-action recovery state. The full deterministic suite is 34/34 green.

**What is still open:** P4 minimal memory, P5 hardening/recovery drills, final functional package, then Will's hands-on UX confirmation and visual pass.

**What the next person should do:** Build the P4 memory contract and its eleven mechanical acceptance tests without expanding into v2.1 personal-life automation.

**Risks or weirdness:** Claude remains signed out, so independent model checking was unavailable; deterministic verification remained authoritative. The first reliability attempts exposed and fixed the GUI-sandbox boundary and fixture preflight, and only the final fully green run counts as P3 evidence.

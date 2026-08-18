# P6 progress — continuity coordinator

P6 advances the accepted v2.1 continuity direction without beginning the deferred visual redesign.

## 2026-08-18 — local routing and continuity core

**What changed:** Context resolution now happens before a prompt is stored. A specialist request branches away from its source conversation; continuation language can reopen a matching named project through a bounded local FTS index; explicit navigation uses no external engine. Software work outranks the product's eventual domain, scheduling language remains General until Lifestyle exists, and worker prompts receive only bounded history from the selected conversation. High-confidence non-sensitive profile facts auto-save with provenance while sensitive incidental facts remain reviewable.

**What I verified:** 56 deterministic tests pass. The exact Proposal 007 cases cover General-to-Coding branching, `Code a quant bot for investing`, `Set my schedule for the research meeting`, local `Reopen tic tac toe`, delegated `Update tic tac toe`, generic in-project follow-up, automatic name memory, sensitive-memory review, and target-only history. The rendered Electron smoke passes with DOM assertions that the General message count remains unchanged and navigation adds no project message; the screenshot is `app/test-results/electron-smoke.png`.

**What is still open:** Coding conversations still need their own selected/created project directories and a writable Coding execution path. The Lifestyle scheduler, conversation-management controls, learned-router experiment, memory graph, and new visual direction remain subsequent slices.

**What the next person should do:** Add a local project registry and safe Coding project-root selection/creation, then run a real game creation through Codex in that directory without granting Coding permission to edit GROVER.

**Any risks or weirdness:** The deterministic subject matcher intentionally abstains when a project name is generic. Those misses should become labeled routing examples; lowering the threshold without evidence would create worse cross-project contamination.

## 2026-08-18 — isolated Coding projects, tiered workers, and scalable history/memory

**What changed:** File-producing Coding conversations now own a local project folder under Documents/GROVER Projects or a folder Will chooses. Coding receives project-scoped write access but cannot target, contain, or sit inside the GROVER repository. Project review uses the same folder read-only. The provider-neutral manager now selects fast, balanced, or frontier profiles from SQLite configuration; the verified Codex mapping is Terra/low, Terra/medium, and Sol/high. Memory search uses local FTS, safe old proposals auto-apply, only 200 recent memories ride on normal state updates, and older conversations load their messages on demand.

**What I verified:** 61 deterministic checks and the rendered Electron smoke pass. Direct account probes passed for the exact Terra/low and Sol/high profiles. The live Coding acceptance created a browser tic-tac-toe project through GROVER using recorded Sol/high routing, kept the GROVER working tree unchanged, rendered nine playable cells, clicked a winning sequence, asserted `X wins`, and saved `app/test-results/live-coding-tictactoe.png`. A separate live Ask passed through GROVER's recorded Terra/low fast profile.

**What is still open:** Package and run the RC.3 Windows executable against a backed-up copy of Will's current local data. The Lifestyle scheduler, delete/archive/reorder controls, learned-router evaluation, and visual memory graph remain later functional/visual slices.

**What the next person should do:** Version and package RC.3, run packaged routing plus live Codex smokes, then launch it on Will's existing database so eligible old memory proposals migrate and the new conversation/project indexes populate.

**Any risks or weirdness:** Codex CLI startup still carries nontrivial fixed overhead, so deterministic local answers are the main route to instant behavior. A learned local coordinator should not be downloaded or trained until real corrections form an eval set that can prove it improves ambiguous cases.

## 2026-08-18 — RC.3 packaged continuity candidate

**What changed:** Versioned the continuity core as `2.0.0-rc.3` and rebuilt the single-file Windows application. A packaged screenshot review found and fixed project-folder controls leaking into General; the rebuilt artifact has an explicit regression assertion.

**What I verified:** The final 156,790,943-byte portable executable (SHA-256 `934700B1F07621126909FFED1060F7F649BA70C41ABE2D79CC3706EB718E521D`) passed packaged automatic profile memory, indexed search, General-to-Coding branch isolation, local project reopen without message pollution, project-folder creation, tier-profile presence, and a live bundled-Codex assistant response. The final screenshot is `app/test-results/packaged-portable-functional.png`. All 62 deterministic checks pass, including durable education-role auto-memory without transient `I am` capture.

**What is still open:** Will's hands-on UX pass plus the later functional slices listed above.

**What the next person should do:** Continue with functional friction in RC.3 before any visual redesign. The first larger domain slice should be the Lifestyle scheduling contract after the coordinator's real routing corrections are collected.

**Any risks or weirdness:** Direct Playwright Electron launch is not compatible with the slow portable self-extractor and hit the old single-instance path; the successful packaged verifier uses the executable's debugging endpoint, asserts the same DOM/state behaviors, and kills only its isolated process tree afterward.

## 2026-08-18 — real-data launch

**What changed:** Backed up the existing user database, launched the exact RC.3 portable executable against the normal Windows user-data location, and allowed the one-time conservative memory migration to run.

**What I verified:** The visible GROVER window is responsive. Active memories moved from 1 to 2, pending proposals moved from 1 to 0, all six model profiles and six conversation-search rows remain available, and no invalid context records exist. The pre-migration backup is `C:\Users\wdgor\AppData\Roaming\grover\grover-pre-rc3-continuity.db`.

**What is still open:** Will's hands-on functional and UX troubleshooting.

**What the next person should do:** Fix observed functional friction before implementing the new visual direction.

**Any risks or weirdness:** The portable parent process stays open while the extracted Electron child runs; this is expected for a single-file portable build.

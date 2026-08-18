# GROVER 2.0.0-rc.3 continuity candidate

Built and verified locally on 2026-08-18. This candidate retains the P1–P5 trust kernel and adds the mechanically green P6 continuity core. Visual redesign remains intentionally deferred.

## Portable application

- File: `app/release/GROVER-2.0.0-rc.3-portable.exe`
- Size: 156,790,943 bytes
- SHA-256: `934700B1F07621126909FFED1060F7F649BA70C41ABE2D79CC3706EB718E521D`
- Installation: none; copy the single file to another Windows folder or machine and run it.
- Runtime: the native Codex runtime is embedded. Claude remains an optional fallback and exposes an explicit sign-in action when installed.
- Data: conversations, memory, evidence, policy decisions, and settings remain in the Windows user-data folder rather than beside the executable.

## Final verification

- 62/62 deterministic tests pass.
- Electron desktop smoke passes with renderer isolation, no document reloads, Enter-to-send, General→Coding branching without source pollution, local conversation reopen, project-folder visibility boundaries, automatic/searchable memory, policy visibility, and restart persistence.
- The exact portable executable passes those core flows and answers through its bundled Codex runtime; its live assertion requires the expected text in an assistant message.
- High-confidence non-sensitive profile facts save locally without review; eligible old proposals migrate once. Sensitive incidental facts remain reviewable.
- Live Codex Ask passes through the recorded Terra/low fast profile.
- Live Coding creates an isolated browser tic-tac-toe project through the recorded Sol/high frontier profile, renders nine cells, and detects a clicked X win while leaving the GROVER repository unchanged.
- Live memory recall passes after a real database close/reopen.
- Live Builder reliability passes UI, backend, setting, persistence, private-space refusal, accumulated tests, evidence, commit, and receipt cases.
- `npm audit --omit=dev` reports zero vulnerabilities.

## Five-line handoff

**What changed:** The portable Windows app now resolves and reopens conversations locally, keeps redirected prompts out of their source chat, gives file-producing Coding conversations isolated local project folders, routes external work through configurable fast/balanced/frontier profiles, and keeps memory/history payloads bounded as they scale.

**What I verified:** Every prior mechanical phase exit remains green, and the source plus exact RC.3 artifact passed the deterministic, rendered, live tier-routing, isolated Coding, memory-scaling, and packaged regressions above.

**What is still open:** Hands-on UX troubleshooting; Lifestyle scheduling; delete/archive/reorder history controls; a labeled learned-router evaluation; optional memory graph; and the new visual design. External account actions and server deployment remain deliberately disconnected. RC.3 is running on Will's backed-up local data; the eligible education-role proposal migrated automatically.

**What the next person should do:** Use RC.3 normally: branch from General into a named Coding project, leave and ask to reopen/update/audit it, inspect its Windows project folder, try local profile-memory questions, and report ambiguous routes. Use that evidence before training or downloading a coordinator model.

**Risks or weirdness:** Codex CLI has fixed startup overhead even on a fast model, so instant behavior depends on deterministic local paths. The learned router is intentionally deferred until real corrections provide an eval set. The executable still uses the default icon and may show the usual Windows warning for a locally built app without a commercial publisher certificate.

# GROVER 2.0.0-rc.1 functional candidate

Built and verified locally on 2026-08-18. This candidate completes the approved functional passes P1–P5. It is intentionally not labeled the final visual v2.0 release until Will completes hands-on UX confirmation and supplies the new visual direction.

## Portable application

- File: `app/release/GROVER-2.0.0-rc.1-portable.exe`
- Size: 156,744,204 bytes
- SHA-256: `A658BB86BD06594B4F9A3F87909DE2F22048DCF21682EB934C030294052CF997`
- Installation: none; copy the single file to another Windows folder or machine and run it.
- Runtime: the native Codex runtime is embedded. Claude remains an optional fallback and exposes an explicit sign-in action when installed.
- Data: conversations, memory, evidence, policy decisions, and settings remain in the Windows user-data folder rather than beside the executable.

## Final verification

- 51/51 deterministic tests pass.
- Electron desktop smoke passes with renderer isolation, no document reloads, Enter-to-send, memory proposal review, policy visibility, and restart persistence.
- Packaged executable launches and answers through its bundled Codex runtime.
- Live Codex Ask passes.
- Live memory recall passes after a real database close/reopen.
- Live Builder reliability passes UI, backend, setting, persistence, private-space refusal, accumulated tests, evidence, commit, and receipt cases.
- `npm audit --omit=dev` reports zero vulnerabilities.

## Five-line handoff

**What changed:** The complete functional scope now runs as a portable Windows application: self-organizing context conversations, provider-neutral agent routing, Builder execution and verification, reviewable memory, backup/restore, policy and budget gates, kill switch, and failed-build recovery.

**What I verified:** Every mechanical phase exit and the final packaged/live regression set above passed against the RC source and artifact.

**What is still open:** Will's hands-on functional/UX confirmation and the new visual design pass. External account actions and server deployment remain deliberately disconnected.

**What the next person should do:** Run the portable executable and use ordinary language to try an everyday question, a Coding project, a GROVER change, memory correction/deletion/backup, pause/cancel, and agent sign-in. Log functional friction before visual work.

**Risks or weirdness:** The executable is portable but not given a final custom icon or installer because visual identity is deferred. Windows may show the usual warning for a locally built app without a commercial publisher certificate. Keep the executable and its user-data folder backed up; use Memory's export/restore controls for portable memory backups.

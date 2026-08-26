# GROVER Windows desktop application

## Run the portable application

Open:

`release/GROVER-2.1.0-rc.1-portable.exe`

It is a no-install Windows application with the verified learned manager, CUDA inference runtime, and Codex runtime bundled inside. You can copy that single executable to another compatible Windows NVIDIA computer. The verified artifact is 1,941,125,568 bytes with SHA-256 `932FDDBEFF82FE614CFCC9D8E95BCA778F1605F9CAC6F9146813D00945545105`.

For everyday use on this computer, `release/win-unpacked/GROVER.exe` starts faster because Windows does not have to extract the embedded model on every launch. Keep the entire `win-unpacked` folder together. Use the single portable executable for the simplest drag-and-drop transfer.

GROVER keeps its database, evidence, and human-readable memory vault in the current Windows user's application-data folder, not beside the executable.

On the first launch from an unfamiliar folder, Windows may display a SmartScreen warning because this development build is not code-signed. No server or browser is required.

## Current functional surface

- One natural-language Home entry point that automatically opens a persistent conversation in Coding, Research, Finance, Health, Business, GROVER, or General.
- No intent form: Enter sends, Shift+Enter adds a line, and a conversation can be moved when automatic organization guesses wrong.
- The learned local manager owns route, project continuity, retrieval, memory proposals, local response/delegation, clarification, worker/tier choice, briefing, and post-worker supervision. Deterministic code validates IDs and enforces privacy, permissions, budgets, evidence, and approval boundaries.
- Provider-neutral routing with Codex preferred initially and Claude available as fallback/checker.
- Agent readiness and explicit Codex/Claude sign-in controls in Settings.
- A troubleshooting inbox with result-linked reports, automatic failure/latency incidents, exact manager-stage replay, and user-approved regression cases.
- Local append-only event history, authoritative task state, pause/resume/cancel controls, cost records, hard cap, and kill switch.
- Separate profile and project memory, searchable project goals/requirements/decisions/outcomes/artifacts/next actions, Markdown vault files, correction/forget/expiry, and backup/restore.
- Builder branches, tests, protected-path checks, evidence, commits, and receipts.
- Local-only operation; external actions and server deployment remain disconnected.

## Development verification

From this directory:

- `npm test` — deterministic core tests.
- `npm run test:desktop` — Electron interaction, persistence, isolation, no-navigation, and screenshot smoke.
- `npm run test:manager-parity` — protected exact outputs across all nine manager contracts.
- `npm run test:manager-live` — rendered authoritative learned-manager lifecycle.
- `npm run test:engine` — live Codex Ask flow.
- `npm run test:builder` — live isolated Builder branch/edit/test/commit/receipt flow.
- `npm run test:portable` — real single-file executable, bundled manager, five-stage local request, and supervised Codex handoff.
- `npm run dist` — rebuild the portable Windows executable.

Generated packages and screenshots are intentionally gitignored.

The exact portable smoke measured 228.686 seconds for first extraction/startup on this laptop, 4.273 seconds for a five-stage manager greeting, and 78.235 seconds for a real supervised Codex file task whose output bytes were independently checked. The large startup cost belongs to the single-file wrapper, not the unpacked everyday form.

# GROVER Windows desktop application

## Run the portable application

Open:

`release/GROVER-2.0.0-p1-portable.exe`

It is a no-install Windows application. You can move that single executable to another folder on this computer. GROVER keeps its database, evidence, and human-readable memory vault in the current Windows user's application-data folder, not beside the executable.

On the first launch from an unfamiliar folder, Windows may display a SmartScreen warning because this development build is not code-signed. No server or browser is required.

## Current functional surface

- One natural-language Home entry point that automatically opens a persistent conversation in Coding, Research, Finance, Health, Business, GROVER, or General.
- No intent form: Enter sends, Shift+Enter adds a line, and a conversation can be moved when automatic organization guesses wrong.
- Provider-neutral routing with Codex preferred initially and Claude available as fallback/checker.
- Agent readiness and explicit Codex/Claude sign-in controls in Settings.
- Explainable routing history and “Useful / Needs improvement” feedback that affects future automatic ranking.
- Local append-only event history, authoritative task state, pause/resume/cancel controls, cost records, hard cap, and kill switch.
- Local memory database plus Markdown vault files.
- Builder branches, tests, protected-path checks, evidence, commits, and receipts.
- Local-only operation; external actions and server deployment remain disconnected.

## Development verification

From this directory:

- `npm test` — deterministic core tests.
- `npm run test:desktop` — Electron interaction, persistence, isolation, no-navigation, and screenshot smoke.
- `npm run test:engine` — live Codex Ask flow.
- `npm run test:builder` — live isolated Builder branch/edit/test/commit/receipt flow.
- `npm run test:portable` — real single-file executable plus its bundled Codex runtime.
- `npm run dist` — rebuild the portable Windows executable.

Generated packages and screenshots are intentionally gitignored.

# GROVER Windows desktop application

## Run the portable application

Open:

`release/GROVER-2.0.0-p1-portable.exe`

It is a no-install Windows application. You can move that single executable to another folder on this computer. GROVER keeps its database, evidence, and human-readable memory vault in the current Windows user's application-data folder, not beside the executable.

On the first launch from an unfamiliar folder, Windows may display a SmartScreen warning because this development build is not code-signed. No server or browser is required.

## Current functional surface

- One natural-language front door with Ask, Work, Act, Build GROVER, and Remember intents.
- Provider-neutral routing with Codex preferred initially and Claude available as fallback/checker.
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
- `npm run dist` — rebuild the portable Windows executable.

Generated packages and screenshots are intentionally gitignored.

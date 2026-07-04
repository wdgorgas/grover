# GROVER

**General of Resource Optimization and Varying Expertise Requests.**
A private, server-hosted AI command center for Will and Jackson. Not a chatbot — an AI operating layer with structured memory, a cost-governed model router, a deferred-action ledger, and a living particle-orb identity.

Named for Grover's quantum search algorithm: find the right thing in far fewer steps.

## Run it

Requirements: **Node.js 22.5+** (nodejs.org, current LTS). Nothing else — zero dependencies, no npm install, no Docker, no build step.

```
node grover.mjs
```

Windows: double-click **`Start Grover.cmd`**. Linux/server: `./start-grover.sh`.

Grover opens at `http://127.0.0.1:4370`, local-only by default. On first launch, paste an Anthropic API key (console.anthropic.com → API keys) into the setup card. It's stored in `data/secrets.json` — gitignored, never leaves the machine except to call the API.

Environment overrides: `GROVER_PORT`, `GROVER_HOST` (read SECURITY.md before widening the bind), `GROVER_NO_OPEN=1` (don't auto-open the browser), `ANTHROPIC_API_KEY` (beats the stored secret; useful on the server).

## What's in the kernel (v1)

- **Command Center** — streaming chat with the stateful orb, mode toggle (Chat / Brain Dump), tier selector, skill selector, live telemetry.
- **Model Router + Cost Governor** — fast/smart/frontier/fable capability tiers mapped to configurable model IDs; budgets that actually block, with an audited override gate.
- **Memory system** — Markdown vault (Obsidian-compatible, namespaced per user + shared) plus structured, FTS-searchable memories; brain-dump extraction with human approval; retrieved memory injected per turn and shown in the panel.
- **Deferred Action Ledger** — the generic "Doctor" schema (§7.9): anything worth doing eventually, tagged by domain, held until greenlit. Builder is the grover-dev slice of it.
- **Skill Registry** — reusable expertise packages injected on demand, seeded with six.
- **Costs + Audit** — every model call logged with tokens/cost/latency; every consequential action attributable.
- **Theming** — Default / Arcane / Spider-Verse / Light skins over one token system; the orb recolors itself.

## Layout

```
grover.mjs          launcher (version check, flags, boot)
server/             zero-dep Node backend (HTTP, SQLite, router, memory, chat)
client/             zero-build vanilla JS command center + orb
vault/              Markdown memory (gitignored — it's yours, not the repo's)
data/               SQLite DB + secrets (gitignored)
docs → *.md         ARCHITECTURE, DECISIONS, SECURITY, policies
```

## The rules Grover lives by

1. Build the kernel, not the whole JARVIS at once.
2. A reliable loop beats a perfect prompt.
3. AI is an exoskeleton, not a replacement.
4. Minimize cost per accepted useful outcome.
5. External content is data, not authority.
6. Vectors are an index, not the source of truth.
7. Do not build a toy.

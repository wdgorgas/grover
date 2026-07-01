# ARCHITECTURE

Current state of the Grover kernel. Update this when structure changes — the repo is memory (§17).

## Shape

```
Browser (vanilla JS SPA, zero build)
   │  REST + SSE-over-POST
   ▼
Node 22 server (zero dependencies)
   ├─ server/index.mjs      HTTP entry, static serving, identity resolution
   ├─ server/api.mjs        route table (REST + /api/chat SSE)
   ├─ server/chat.mjs       turn orchestration: context → route → gate → stream → log
   ├─ server/router.mjs     Model Router + Cost Governor (tiers, pricing, budgets)
   ├─ server/anthropic.mjs  fetch-based Anthropic client (streaming, prompt caching)
   ├─ server/memory.mjs     Memory API: vault + structured memories + FTS + context builder
   ├─ server/ledger.mjs     Deferred Action Ledger (generic domain-tagged schema)
   ├─ server/skills.mjs     Skill Registry
   ├─ server/db.mjs         node:sqlite (WAL), schema, settings, audit
   └─ server/config.mjs     paths, env, secrets

Storage
   ├─ data/grover.db        SQLite: structured truth (users, messages, memories,
   │                        ledger, skills, model_calls, audit, settings)
   ├─ data/secrets.json     API key (0600 where supported)
   └─ vault/                Markdown memory, human-readable, namespaced
```

## Key flows

**Chat turn** (`chat.mjs`): persist user msg → build context (constitution + profile
files + FTS-retrieved memories, namespace-filtered) → route tier (internal tasks
always fast; chat defaults smart; frontier/fable are opt-in) → budget gate
(block + approval event if a cap would be exceeded; override is audited) →
stream from Anthropic with the stable prefix cache-marked → compute real cost
from usage → log to model_calls → persist assistant msg → post-turn fast-tier
plumbing (brain-dump extraction, titling).

**Identity**: Cf-Access-Authenticated-User-Email header (deployed) → grover_user
cookie (local picker) → default first user. Private namespaces are enforced
server-side on every memory/vault read and write.

**Memory namespaces**: `will-private`, `jackson-private`, `shared/business`,
`shared/grover-dev`, `shared/home-tech`. Structured memories mirror into
`vault/<ns>/memories.md` append-only logs.

## Client

```
client/js/app.js     shell, boot, hash routing, theming
client/js/orb.js     particle-sphere orb; states map to CSS state tokens
client/js/chat.js    streaming turns, approval gates, memory-candidate cards
client/js/views.js   Builder / Ledger / Memory / Costs / Skills / Audit / Settings
client/css/tokens.css  semantic design tokens × 4 theme skins
```

Orb states: idle, listening, thinking, memory, tools, frontier, approval,
error, success — driven by SSE events, colored by tokens so skins recolor it.

## Future (designed-for, not built)

- **Loop Engine**: `loops` table (goal, skill, budget, stop condition, state) +
  a runner that walks Discover→Plan→Execute→Verify→Iterate→Summarize with the
  Cost Governor gating each step. Closed loops first.
- **Agent Team Manager**: agents as rows with scoped tool permissions;
  maker/checker split; logged inter-agent messages (Output Class 2).
- **Vector retrieval**: `searchMemories()` in memory.mjs is the single seam —
  swap FTS for hybrid retrieval behind it without touching callers.
- **Provider abstraction**: `anthropic.mjs` is the only file that knows the
  wire format; a second provider means one new module + a router map entry.
- **Postgres**: db.mjs isolates all SQL; migration is mechanical if/when
  multi-writer or server-grade needs demand it.

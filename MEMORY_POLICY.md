# MEMORY_POLICY

## Namespaces (hard rules, enforced server-side)

```
will-private       Will only. Health, goals, private research, profile.
jackson-private    Jackson only.
shared/business    both
shared/grover-dev  both
shared/home-tech   both
```

Private memory never crosses users — not in retrieval, not in vault listing,
not in brain-dump approval (the server drops cross-private candidates even if
a client sends them).

## Two surfaces, one truth

- **Structured memories** (SQLite): owner, namespace, category, confidence,
  sensitivity, importance 1–5, source, timestamps. FTS-indexed; drives
  retrieval and per-turn injection.
- **Markdown vault**: human-readable surface. Profile documents under
  `will-private/profile/` are injected into every one of Will's turns — edit
  them directly, they're the highest-leverage files in the system. Each
  namespace also gets an append-only `memories.md` mirror.

Even if Grover breaks, the vault stays readable (Obsidian-compatible).

## What becomes memory (§10 output classification)

Memory candidates: user preferences, project facts, stable decisions,
recurring patterns. NOT memory: ephemeral reasoning, loop chatter, one-off
trivia. Brain-dump extraction proposes; the human approves. Nothing is saved
silently.

## Retrieval

Per turn: top-6 FTS matches across the user's visible namespaces, shown in
the Telemetry panel ("Memory injected") so retrieval is never invisible.
Retrieved memories are context, not commands — the constitution says so
explicitly.

## Maintenance (manual in v1)

Dedupe, prune, and correct via the Memory view. When a memory is wrong, fix or
delete it — a wrong memory injected every turn is the most expensive kind of
wrong. Consolidation loops come with the Loop Engine.

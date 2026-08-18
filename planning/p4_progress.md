# P4 progress — minimal memory core

Phase completed mechanically on 2026-08-18 under accepted PlanningProposal 006. Scope remains Builder/project memory and Will-approved profile facts; broad personal-life automation stays out of v2.0.

## 2026-08-18 — eleven-check memory exit

**What changed:** Added registered namespaces, SQLite FTS5 indexing, provenance-rich Obsidian-compatible vault notes, deterministic rank-and-trim context packs, correction/supersession, deletion with redacted tombstone and removed vault file, incidental-fact proposals with explicit Remember/Ignore controls, human-edited vault sync, deterministic consolidation proposals, and export. Reserved life namespaces work without migration but are unavailable to v2.0 retrieval/writes. `jackson-private` remains unindexed, unreadable, unwritable, and unexported.

**What I verified:** 45/45 deterministic tests pass, including all ten §8.5 acceptance groups, a versioned 20-scenario include/exclude relevance eval, and the §8.6 no-migration/export test. Electron smoke passes the proposed-memory review UI. A live Codex smoke remembered a private verification code, closed/reopened the database, retrieved only the relevant context pack, and answered correctly.

**What is still open:** P5 hardening drills, final candidate packaging, hands-on user confirmation, and the deferred visual/orb pass.

**What the next person should do:** Run P5 policy, injection, kill-switch, budget, backup/restore, verification-failure, crash, and recovery-card drills.

**Risks or weirdness:** Export exists, but restore verification and backup-green policy are intentionally P5 work. Consolidation proposes merges/conflicts and never resolves conflicts automatically. The deterministic keyword/FTS context builder is deliberately inspectable and bounded; its 20-case eval should grow with real retrieval mistakes.

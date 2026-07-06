// db.ts — SQLite bootstrap for the GROVER event spine (master prompt §4.3).
// Uses Node's built-in node:sqlite (DECISIONS.md 2026-07-05: zero-dep stack).
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
-- Append-only, immutable event log. THE single source of truth (§4.3).
-- cost_delta unit: integer micro-USD (DECISIONS.md 2026-07-05).
CREATE TABLE IF NOT EXISTS events (
  seq              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         TEXT NOT NULL UNIQUE,
  scope_type       TEXT NOT NULL CHECK (scope_type IN
                     ('task','build_run','feature_request','system','policy','budget','memory')),
  scope_id         TEXT,
  task_id          TEXT,
  build_run_id     TEXT,
  parent_event_id  TEXT,
  idempotency_key  TEXT NOT NULL UNIQUE,
  ts               TEXT NOT NULL,
  actor            TEXT NOT NULL CHECK (actor IN ('will','grover','engine','tool','system')),
  domain           TEXT,
  phase            TEXT NOT NULL CHECK (phase IN
                     ('intake','planning','editing','verifying','blocked','done','failed',
                      'cancelled','policy','budget','memory','system')),
  plain_language   TEXT NOT NULL CHECK (length(trim(plain_language)) > 0
                                        AND length(plain_language) <= 2000),
  internal_detail  TEXT NOT NULL DEFAULT '',
  evidence_ref     TEXT,
  cost_delta       INTEGER,
  model_run_id     TEXT,
  signoff_state    TEXT
);

-- Denormalized projections. Updated EXCLUSIVELY by reducers (src/reducers.ts).
-- Disposable by design: deleting + replaying events must recreate them (§4.3).
CREATE TABLE IF NOT EXISTS task_state (
  task_id         TEXT PRIMARY KEY,
  status          TEXT NOT NULL,
  origin          TEXT NOT NULL CHECK (origin IN ('foreground','background')),
  plain_language  TEXT NOT NULL,
  actions         TEXT NOT NULL,            -- JSON array; computed server-side, never by clients
  cost_total      INTEGER NOT NULL DEFAULT 0, -- micro-USD
  updated_seq     INTEGER NOT NULL,
  updated_ts      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS build_state (
  build_run_id    TEXT PRIMARY KEY,
  status          TEXT NOT NULL,
  current_phase   TEXT NOT NULL,
  plain_language  TEXT NOT NULL,
  cost_total      INTEGER NOT NULL DEFAULT 0, -- micro-USD
  updated_seq     INTEGER NOT NULL,
  updated_ts      TEXT NOT NULL
);
`;

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

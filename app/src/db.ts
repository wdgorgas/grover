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
                     ('intake','planning','queued','editing','paused','verifying','blocked','done','failed',
                      'cancelled','policy','budget','memory','system')),
  plain_language   TEXT NOT NULL CHECK (length(trim(plain_language)) > 0
                                        AND length(plain_language) <= 2000),
  internal_detail  TEXT NOT NULL DEFAULT '',
  evidence_ref     TEXT,
  cost_delta       INTEGER,
  model_run_id     TEXT,
  signoff_state    TEXT
);

-- "Append-only" is a database invariant, not an application convention.
-- Only a deliberately versioned migration may replace these guards.
CREATE TRIGGER IF NOT EXISTS events_reject_update
BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are immutable: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS events_reject_delete
BEFORE DELETE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only: DELETE is forbidden');
END;

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

CREATE TABLE IF NOT EXISTS feature_requests (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  origin              TEXT NOT NULL CHECK (origin IN ('will_direct','grover_self_initiated','imported')),
  domain              TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('intake','planned','running','blocked','verifying','passed','failed','cancelled')),
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  signoff_state       TEXT NOT NULL CHECK (signoff_state IN ('not_required','required','approved','denied')),
  signoff_reason      TEXT,
  importance          TEXT,
  estimated_effort    TEXT,
  estimated_cost      INTEGER,
  actual_cost         INTEGER NOT NULL DEFAULT 0,
  active_build_run_id TEXT
);

CREATE TABLE IF NOT EXISTS build_runs (
  id                  TEXT PRIMARY KEY,
  feature_request_id  TEXT NOT NULL REFERENCES feature_requests(id),
  task_id             TEXT NOT NULL,
  engine_id           TEXT NOT NULL,
  branch_name         TEXT,
  status              TEXT NOT NULL CHECK (status IN ('queued','running','paused','blocked','verifying','passed','failed','cancelled')),
  current_phase       TEXT NOT NULL,
  started_at          TEXT NOT NULL,
  ended_at            TEXT,
  cost_estimate       INTEGER NOT NULL DEFAULT 0,
  actual_cost         INTEGER NOT NULL DEFAULT 0,
  failure_summary     TEXT,
  recovery_state      TEXT,
  receipt_id          TEXT,
  engine_session_id   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_run_per_feature
ON build_runs(feature_request_id)
WHERE status IN ('queued','running','paused','blocked','verifying');

CREATE TABLE IF NOT EXISTS acceptance_checks (
  id                      TEXT PRIMARY KEY,
  feature_request_id      TEXT NOT NULL REFERENCES feature_requests(id),
  build_run_id            TEXT REFERENCES build_runs(id),
  title                   TEXT NOT NULL,
  description             TEXT NOT NULL,
  check_type              TEXT NOT NULL,
  required_evidence_types TEXT NOT NULL,
  status                  TEXT NOT NULL,
  passes                  INTEGER NOT NULL DEFAULT 0 CHECK (passes IN (0,1)),
  evidence_asset_ids      TEXT NOT NULL DEFAULT '[]',
  one_off                 INTEGER NOT NULL DEFAULT 0 CHECK (one_off IN (0,1)),
  created_by              TEXT NOT NULL,
  amended_by              TEXT,
  amendment_reason        TEXT
);

CREATE TABLE IF NOT EXISTS evidence_assets (
  id                  TEXT PRIMARY KEY,
  build_run_id        TEXT NOT NULL REFERENCES build_runs(id),
  acceptance_check_id TEXT REFERENCES acceptance_checks(id),
  type                TEXT NOT NULL,
  verifier_origin     TEXT NOT NULL,
  trusted             INTEGER NOT NULL CHECK (trusted IN (0,1)),
  uri_or_path         TEXT NOT NULL,
  summary             TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  hash                TEXT
);

CREATE TABLE IF NOT EXISTS git_commits (
  id            TEXT PRIMARY KEY,
  build_run_id  TEXT NOT NULL REFERENCES build_runs(id),
  hash          TEXT NOT NULL,
  branch_name   TEXT NOT NULL,
  message       TEXT NOT NULL,
  diff_summary  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_update_proposals (
  id                TEXT PRIMARY KEY,
  source_event_id   TEXT NOT NULL,
  proposed_operation TEXT NOT NULL CHECK (proposed_operation IN ('create','update','supersede','delete')),
  namespace         TEXT NOT NULL,
  target_memory_id  TEXT,
  status            TEXT NOT NULL CHECK (status IN ('proposed','approved','rejected','applied')),
  provenance        TEXT NOT NULL,
  sensitivity       TEXT NOT NULL,
  rationale         TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  applied_at        TEXT
);

CREATE TABLE IF NOT EXISTS cost_ledger (
  id              TEXT PRIMARY KEY,
  task_id         TEXT,
  build_run_id    TEXT,
  event_id        TEXT,
  kind            TEXT NOT NULL CHECK (kind IN ('estimate','actual','adjustment')),
  amount_micro_usd INTEGER NOT NULL,
  provider        TEXT,
  model           TEXT,
  created_at      TEXT NOT NULL,
  note            TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS budgets (
  id              TEXT PRIMARY KEY,
  soft_micro_usd  INTEGER NOT NULL,
  hard_micro_usd  INTEGER NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1))
);

CREATE TABLE IF NOT EXISTS domain_contracts (
  domain              TEXT PRIMARY KEY,
  allowed_tools       TEXT NOT NULL,
  readable_namespaces TEXT NOT NULL,
  writable_namespaces TEXT NOT NULL,
  default_model_tier  TEXT NOT NULL,
  max_spend_micro_usd INTEGER NOT NULL,
  can_edit_grover     INTEGER NOT NULL CHECK (can_edit_grover IN (0,1))
);

CREATE TABLE IF NOT EXISTS memories (
  id            TEXT PRIMARY KEY,
  namespace     TEXT NOT NULL,
  content       TEXT NOT NULL,
  provenance    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  superseded_by TEXT,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS engine_registry (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider     TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  priority     INTEGER NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1))
);

CREATE TABLE IF NOT EXISTS routing_decisions (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL,
  intent          TEXT NOT NULL,
  selected_engine TEXT NOT NULL,
  backup_engine   TEXT,
  reason          TEXT NOT NULL,
  user_override   INTEGER NOT NULL DEFAULT 0 CHECK (user_override IN (0,1)),
  outcome         TEXT,
  rating          TEXT CHECK (rating IN ('positive','negative')),
  feedback_note   TEXT,
  created_at      TEXT NOT NULL,
  completed_at    TEXT
);

INSERT OR IGNORE INTO budgets(id, soft_micro_usd, hard_micro_usd, enabled)
VALUES ('development-phase', 25000000, 50000000, 1);

INSERT OR IGNORE INTO app_settings(key, value, updated_at)
VALUES ('kill_switch', 'false', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO app_settings(key, value, updated_at)
VALUES ('preferred_engine', 'auto', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO engine_registry(id, display_name, provider, capabilities, priority, enabled)
VALUES
  ('codex-cli', 'Codex', 'openai', '["ask","work","build","review","read","write"]', 10, 1),
  ('claude-cli', 'Claude', 'anthropic', '["ask","work","build","review","read","write"]', 20, 1);

INSERT OR IGNORE INTO domain_contracts
  (domain, allowed_tools, readable_namespaces, writable_namespaces, default_model_tier, max_spend_micro_usd, can_edit_grover)
VALUES
  ('builder', '["read","edit","write","test","git"]', '["will-private","shared-grover-dev"]', '["shared-grover-dev"]', 'frontier', 2000000, 1),
  ('coding', '["read"]', '["will-private","shared-grover-dev"]', '[]', 'mid', 1000000, 0),
  ('research', '["read"]', '["will-private","shared-grover-dev"]', '[]', 'mid', 1000000, 0),
  ('business', '[]', '["will-private"]', '[]', 'mid', 1000000, 0),
  ('quant', '[]', '["will-private"]', '[]', 'frontier', 1000000, 0),
  ('lifestyle', '[]', '["will-private"]', '[]', 'mid', 1000000, 0);
`;

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const routingColumns = db.prepare("PRAGMA table_info('routing_decisions')").all() as unknown as { name: string }[];
  const names = new Set(routingColumns.map((column) => column.name));
  if (!names.has('rating')) db.exec("ALTER TABLE routing_decisions ADD COLUMN rating TEXT CHECK (rating IN ('positive','negative'))");
  if (!names.has('feedback_note')) db.exec('ALTER TABLE routing_decisions ADD COLUMN feedback_note TEXT');
  return db;
}

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
  domain          TEXT,
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
  proposed_content  TEXT,
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
  owner         TEXT NOT NULL DEFAULT 'will',
  namespace     TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'project',
  confidence    TEXT NOT NULL DEFAULT 'high',
  sensitivity   TEXT NOT NULL DEFAULT 'private',
  importance    TEXT NOT NULL DEFAULT 'normal',
  content       TEXT NOT NULL,
  provenance    TEXT NOT NULL,
  vault_path    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  superseded_by TEXT,
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS memory_namespaces (
  id          TEXT PRIMARY KEY,
  owner       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('private','shared','future')),
  fails_closed INTEGER NOT NULL DEFAULT 0 CHECK (fails_closed IN (0,1)),
  created_at  TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  memory_id UNINDEXED,
  content,
  namespace UNINDEXED,
  tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS memory_consolidation_proposals (
  id                TEXT PRIMARY KEY,
  namespace         TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('merge','conflict','stale')),
  memory_ids        TEXT NOT NULL,
  suggested_content TEXT,
  rationale         TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','applied')),
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_exports (
  id          TEXT PRIMARY KEY,
  path        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  hash        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('complete','failed','restored')),
  restored_at TEXT
);

CREATE TABLE IF NOT EXISTS backup_health (
  domain                  TEXT PRIMARY KEY,
  last_success_at         TEXT,
  last_restore_drill_at   TEXT,
  location                TEXT,
  latest_hash             TEXT,
  pending_warning         TEXT,
  updated_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_registry (
  rule_id          TEXT PRIMARY KEY,
  trigger_id       TEXT NOT NULL UNIQUE CHECK (trigger_id IN
                    ('real_money','irreversible_or_destructive','jackson_private',
                     'self_initiated_grover_change','security_boundary')),
  exact_scope      TEXT NOT NULL,
  owner            TEXT NOT NULL,
  origin_approval  TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  last_used_at     TEXT,
  review_at        TEXT NOT NULL,
  expires_at       TEXT,
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE IF NOT EXISTS policy_decisions (
  id              TEXT PRIMARY KEY,
  task_id         TEXT,
  trigger_id      TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('required','approved','denied')),
  action_summary  TEXT NOT NULL,
  reason          TEXT NOT NULL,
  memo            TEXT NOT NULL,
  origin          TEXT NOT NULL CHECK (origin IN ('will_direct','grover_self_initiated','imported')),
  created_at      TEXT NOT NULL,
  decided_at      TEXT
);

CREATE TABLE IF NOT EXISTS recovery_cards (
  id                  TEXT PRIMARY KEY,
  build_run_id        TEXT NOT NULL UNIQUE REFERENCES build_runs(id),
  reason              TEXT NOT NULL,
  changed_files       TEXT NOT NULL,
  revert_state        TEXT NOT NULL CHECK (revert_state IN ('not_reverted','reverted','not_inspected')),
  evidence_collected  TEXT NOT NULL,
  cost_spent          INTEGER NOT NULL,
  next_safe_action    TEXT NOT NULL,
  created_at          TEXT NOT NULL
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
  model_tier      TEXT,
  selected_model  TEXT,
  reasoning_effort TEXT,
  created_at      TEXT NOT NULL,
  completed_at    TEXT
);

-- Learned-manager proposals are shadow evidence only. Nothing reads this
-- table to choose a context, worker, tool, permission, or memory mutation.
CREATE TABLE IF NOT EXISTS manager_shadow_decisions (
  id                 TEXT PRIMARY KEY,
  task_id            TEXT NOT NULL,
  manager_task       TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('matched','differed','invalid','failed')),
  input_json         TEXT NOT NULL,
  deterministic_json TEXT NOT NULL,
  proposed_json      TEXT,
  latency_ms         INTEGER,
  model_hash         TEXT,
  error_detail       TEXT,
  created_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS manager_shadow_by_task
ON manager_shadow_decisions(task_id, created_at);

-- First-class learned-manager flight recorder. Inputs are bounded references
-- and hashes; source prompts and vault contents stay in their authoritative
-- conversation/memory records instead of being duplicated here.
CREATE TABLE IF NOT EXISTS manager_flights (
  id                 TEXT PRIMARY KEY,
  task_id            TEXT NOT NULL UNIQUE,
  conversation_id    TEXT REFERENCES conversations(id),
  project_id         TEXT,
  request_hash       TEXT NOT NULL,
  model_hash         TEXT,
  prompt_version     TEXT NOT NULL,
  app_version        TEXT NOT NULL,
  state              TEXT NOT NULL CHECK (state IN
                       ('planning','executing','blocked','completed','failed','cancelled')),
  total_latency_ms   INTEGER NOT NULL DEFAULT 0,
  error_summary      TEXT,
  started_at         TEXT NOT NULL,
  completed_at       TEXT,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manager_stage_records (
  id              TEXT PRIMARY KEY,
  flight_id       TEXT NOT NULL REFERENCES manager_flights(id),
  sequence        INTEGER NOT NULL,
  stage           TEXT NOT NULL CHECK (stage IN
                    ('route','continuity','retrieval','memory','respond','clarify','execution','brief','supervise')),
  attempt         INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL CHECK (status IN ('succeeded','failed')),
  input_refs_json TEXT NOT NULL,
  output_json     TEXT,
  latency_ms      INTEGER NOT NULL DEFAULT 0,
  model_hash      TEXT,
  prompt_version  TEXT NOT NULL,
  error_detail    TEXT,
  created_at      TEXT NOT NULL,
  UNIQUE(flight_id, stage, attempt)
);

CREATE INDEX IF NOT EXISTS manager_stages_by_flight
ON manager_stage_records(flight_id, sequence);

CREATE TABLE IF NOT EXISTS incidents (
  id                TEXT PRIMARY KEY,
  flight_id         TEXT REFERENCES manager_flights(id),
  task_id           TEXT,
  stage_record_id   TEXT REFERENCES manager_stage_records(id),
  source            TEXT NOT NULL CHECK (source IN ('automatic','will_report','will_correction')),
  kind              TEXT NOT NULL CHECK (kind IN
                      ('manager_error','validation_failure','provider_failure','task_failure','latency',
                       'wrong_route','wrong_continuity','wrong_memory','wrong_tool','wrong_answer','ux','other')),
  severity          TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  status            TEXT NOT NULL CHECK (status IN
                      ('open','diagnosed','fix_prepared','waiting','fixed','replay_passed','closed')),
  fingerprint       TEXT NOT NULL UNIQUE,
  summary           TEXT NOT NULL,
  note              TEXT,
  correction_json   TEXT,
  diagnostic_json   TEXT,
  occurrence_count  INTEGER NOT NULL DEFAULT 1,
  first_seen_at     TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incident_occurrences (
  id           TEXT PRIMARY KEY,
  incident_id  TEXT NOT NULL REFERENCES incidents(id),
  flight_id    TEXT REFERENCES manager_flights(id),
  task_id      TEXT,
  detail_json  TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS incidents_by_status
ON incidents(status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS engine_model_profiles (
  engine_id        TEXT NOT NULL REFERENCES engine_registry(id),
  model_tier       TEXT NOT NULL CHECK (model_tier IN ('fast','balanced','frontier')),
  model_id         TEXT,
  reasoning_effort TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  updated_at       TEXT NOT NULL,
  PRIMARY KEY(engine_id, model_tier)
);

-- Local conversation index. Task execution remains recorded in the immutable
-- event spine; these rows make those results reopenable as normal conversations.
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  context    TEXT NOT NULL CHECK (context IN
               ('general','coding','research','finance','health','business','builder')),
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  task_id         TEXT,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('pending','complete','failed')),
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS conversation_messages_by_conversation
ON conversation_messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS conversation_messages_by_task
ON conversation_messages(task_id);

-- One bounded local search row per conversation. This keeps project lookup
-- instant without sending chat history to a model.
CREATE VIRTUAL TABLE IF NOT EXISTS conversation_search USING fts5(
  conversation_id UNINDEXED,
  context UNINDEXED,
  content,
  tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS context_routing_decisions (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
  initial_context TEXT NOT NULL,
  final_context   TEXT NOT NULL,
  rule_version    TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  corrected_at    TEXT
);

CREATE TABLE IF NOT EXISTS conversation_route_log (
  id                     TEXT PRIMARY KEY,
  task_id                TEXT NOT NULL,
  source_conversation_id TEXT REFERENCES conversations(id),
  target_conversation_id TEXT NOT NULL REFERENCES conversations(id),
  target_context         TEXT NOT NULL,
  disposition            TEXT NOT NULL CHECK (disposition IN
                           ('created','continued','branched','reopened','navigated')),
  reason                 TEXT NOT NULL,
  request                TEXT NOT NULL,
  created_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS conversation_route_log_by_task
ON conversation_route_log(task_id, created_at);

CREATE TABLE IF NOT EXISTS projects (
  id                    TEXT PRIMARY KEY,
  conversation_id       TEXT NOT NULL UNIQUE REFERENCES conversations(id),
  context               TEXT NOT NULL CHECK (context = 'coding'),
  name                  TEXT NOT NULL,
  root_path             TEXT NOT NULL UNIQUE,
  created_automatically INTEGER NOT NULL DEFAULT 0 CHECK (created_automatically IN (0,1)),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_by_updated
ON projects(updated_at DESC);

INSERT OR IGNORE INTO budgets(id, soft_micro_usd, hard_micro_usd, enabled)
VALUES ('development-phase', 25000000, 50000000, 1);

INSERT OR IGNORE INTO app_settings(key, value, updated_at)
VALUES ('kill_switch', 'false', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO app_settings(key, value, updated_at)
VALUES ('preferred_engine', 'auto', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO engine_registry(id, display_name, provider, capabilities, priority, enabled)
VALUES
  ('codex-cli', 'Codex', 'openai', '["ask","work","project","build","review","read","write"]', 10, 1),
  ('claude-cli', 'Claude', 'anthropic', '["ask","work","project","build","review","read","write"]', 20, 1);

INSERT OR IGNORE INTO engine_model_profiles(engine_id, model_tier, model_id, reasoning_effort, enabled, updated_at)
VALUES
  ('codex-cli', 'fast', 'gpt-5.6-terra', 'low', 1, CURRENT_TIMESTAMP),
  ('codex-cli', 'balanced', 'gpt-5.6-terra', 'medium', 1, CURRENT_TIMESTAMP),
  ('codex-cli', 'frontier', 'gpt-5.6-sol', 'high', 1, CURRENT_TIMESTAMP),
  ('claude-cli', 'fast', NULL, NULL, 1, CURRENT_TIMESTAMP),
  ('claude-cli', 'balanced', NULL, NULL, 1, CURRENT_TIMESTAMP),
  ('claude-cli', 'frontier', NULL, NULL, 1, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO memory_namespaces(id, owner, kind, fails_closed, created_at)
VALUES
  ('will-private', 'will', 'private', 0, CURRENT_TIMESTAMP),
  ('jackson-private', 'jackson', 'private', 1, CURRENT_TIMESTAMP),
  ('shared-grover-dev', 'shared', 'shared', 0, CURRENT_TIMESTAMP),
  ('shared-home-tech', 'shared', 'shared', 0, CURRENT_TIMESTAMP),
  ('shared-business', 'shared', 'shared', 0, CURRENT_TIMESTAMP),
  ('life-health', 'will', 'future', 0, CURRENT_TIMESTAMP),
  ('life-finance', 'will', 'future', 0, CURRENT_TIMESTAMP),
  ('life-home', 'will', 'future', 0, CURRENT_TIMESTAMP),
  ('life-travel', 'will', 'future', 0, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO policy_registry
  (rule_id, trigger_id, exact_scope, owner, origin_approval, created_at, review_at, active)
VALUES
  ('builtin-real-money', 'real_money', 'Purchases, subscriptions, trades, transfers, or budget increases', 'will', 'master-prompt-p0', CURRENT_TIMESTAMP, '2027-01-01', 1),
  ('builtin-destructive', 'irreversible_or_destructive', 'Unbacked destructive actions, history rewrite, or destructive external writes', 'will', 'master-prompt-p0', CURRENT_TIMESTAMP, '2027-01-01', 1),
  ('builtin-jackson-private', 'jackson_private', 'Any read, write, export, or inference involving jackson-private', 'jackson', 'master-prompt-p0', CURRENT_TIMESTAMP, '2027-01-01', 1),
  ('builtin-self-change', 'self_initiated_grover_change', 'Any GROVER-generated request to modify GROVER behavior or policy', 'will', 'master-prompt-p0', CURRENT_TIMESTAMP, '2027-01-01', 1),
  ('builtin-security', 'security_boundary', 'Authentication, secrets, permissions, network exposure, injection, kill-switch, audit, or registry changes', 'will', 'master-prompt-p0', CURRENT_TIMESTAMP, '2027-01-01', 1);

INSERT OR IGNORE INTO domain_contracts
  (domain, allowed_tools, readable_namespaces, writable_namespaces, default_model_tier, max_spend_micro_usd, can_edit_grover)
VALUES
  ('builder', '["read","edit","write","test","git"]', '["will-private","shared-grover-dev"]', '["shared-grover-dev"]', 'frontier', 2000000, 1),
  ('coding', '["read","edit","write","test"]', '["will-private","shared-grover-dev"]', '[]', 'mid', 1000000, 0),
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
  if (!names.has('model_tier')) db.exec('ALTER TABLE routing_decisions ADD COLUMN model_tier TEXT');
  if (!names.has('selected_model')) db.exec('ALTER TABLE routing_decisions ADD COLUMN selected_model TEXT');
  if (!names.has('reasoning_effort')) db.exec('ALTER TABLE routing_decisions ADD COLUMN reasoning_effort TEXT');
  const taskColumns = db.prepare("PRAGMA table_info('task_state')").all() as unknown as { name: string }[];
  if (!taskColumns.some((column) => column.name === 'domain')) db.exec('ALTER TABLE task_state ADD COLUMN domain TEXT');
  db.exec(`UPDATE task_state
    SET domain = (SELECT domain FROM events WHERE events.task_id = task_state.task_id AND domain IS NOT NULL ORDER BY seq DESC LIMIT 1)
    WHERE domain IS NULL`);
  const memoryColumns = new Set((db.prepare("PRAGMA table_info('memories')").all() as unknown as { name: string }[]).map((column) => column.name));
  for (const [name, definition] of [
    ['owner', "TEXT NOT NULL DEFAULT 'will'"],
    ['category', "TEXT NOT NULL DEFAULT 'project'"],
    ['confidence', "TEXT NOT NULL DEFAULT 'high'"],
    ['sensitivity', "TEXT NOT NULL DEFAULT 'private'"],
    ['importance', "TEXT NOT NULL DEFAULT 'normal'"],
    ['vault_path', 'TEXT'],
  ]) if (!memoryColumns.has(name)) db.exec(`ALTER TABLE memories ADD COLUMN ${name} ${definition}`);
  const proposalColumns = new Set((db.prepare("PRAGMA table_info('memory_update_proposals')").all() as unknown as { name: string }[]).map((column) => column.name));
  if (!proposalColumns.has('proposed_content')) db.exec('ALTER TABLE memory_update_proposals ADD COLUMN proposed_content TEXT');
  db.exec(`UPDATE engine_registry
    SET capabilities = '["ask","work","project","build","review","read","write"]'
    WHERE id IN ('codex-cli','claude-cli')`);
  db.exec(`UPDATE domain_contracts
    SET allowed_tools = '["read","edit","write","test"]', can_edit_grover = 0
    WHERE domain = 'coding'`);
  const missingSearch = db.prepare(
    `SELECT c.id, c.context, c.title FROM conversations c
     LEFT JOIN conversation_search s ON s.conversation_id = c.id
     WHERE s.conversation_id IS NULL`
  ).all() as unknown as { id: string; context: string; title: string }[];
  const searchMessages = db.prepare(
    'SELECT content FROM conversation_messages WHERE conversation_id = ? ORDER BY rowid DESC LIMIT 80'
  );
  const insertSearch = db.prepare('INSERT INTO conversation_search(conversation_id, context, content) VALUES (?, ?, ?)');
  for (const conversation of missingSearch) {
    const messages = (searchMessages.all(conversation.id) as unknown as { content: string }[]).reverse();
    const content = [conversation.title, ...messages.map((message) => message.content)]
      .join(' ').toLowerCase().replace(/\btic[\s-]+tac[\s-]+toe\b/g, 'tictactoe').replace(/[^a-z0-9]+/g, ' ').trim().slice(-24_000);
    insertSearch.run(conversation.id, conversation.context, content);
  }
  return db;
}

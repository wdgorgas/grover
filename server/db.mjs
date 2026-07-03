/**
 * Database layer — node:sqlite (built into Node 22.5+).
 *
 * Structured truth lives here (master prompt §9). The Markdown vault is the
 * human-readable memory surface; this is the machine-readable one.
 */
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH, DEFAULT_SETTINGS } from './config.mjs';

export let db;
export let ftsAvailable = false;

export function initDb() {
  db = new DatabaseSync(DB_PATH);
  // WAL is preferred but not guaranteed (network mounts / exotic filesystems
  // can't memory-map). Fall back rather than fail to boot.
  try { db.exec(`PRAGMA journal_mode = WAL;`); }
  catch { try { db.exec(`PRAGMA journal_mode = DELETE;`); } catch { /* default */ } }
  db.exec(`PRAGMA foreign_keys = ON;`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL DEFAULT 'New conversation',
      mode TEXT NOT NULL DEFAULT 'chat',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      tier TEXT,
      cost REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY,
      owner TEXT NOT NULL,
      namespace TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'medium',
      sensitivity TEXT NOT NULL DEFAULT 'normal',
      importance INTEGER NOT NULL DEFAULT 3,
      source TEXT NOT NULL DEFAULT 'chat',
      vault_path TEXT,
      expired INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY,
      item TEXT NOT NULL,
      domain TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'follow-up',
      severity TEXT NOT NULL DEFAULT 'medium',
      cost_estimate TEXT,
      effort_estimate TEXT,
      detected_by TEXT NOT NULL DEFAULT 'Will',
      status TEXT NOT NULL DEFAULT 'pending_greenlight',
      greenlighter TEXT,
      approval_policy TEXT,
      linked_project TEXT,
      next_review TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL,
      activation TEXT,
      prompt TEXT NOT NULL,
      allowed_tools TEXT,
      risk_level TEXT NOT NULL DEFAULT 'low',
      cost_behavior TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS model_calls (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      conversation_id INTEGER,
      task_type TEXT NOT NULL,
      model TEXT NOT NULL,
      tier TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      latency_ms INTEGER,
      escalated INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_memories_owner ON memories(owner, expired);
    CREATE INDEX IF NOT EXISTS idx_ledger_domain ON ledger(domain, status);
    CREATE INDEX IF NOT EXISTS idx_calls_created ON model_calls(created_at);
  `);

  // Additive migrations — safe on existing databases.
  addColumnIfMissing('ledger', 'brief', 'TEXT');
  addColumnIfMissing('ledger', 'conversation_id', 'INTEGER');
  addColumnIfMissing('skills', 'kind', `TEXT NOT NULL DEFAULT 'ops'`);
  addColumnIfMissing('skills', 'accent', 'TEXT');

  // FTS5 ships in Node's bundled SQLite, but feature-detect anyway —
  // retrieval degrades to LIKE search rather than crashing.
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        content, content='memories', content_rowid='id'
      );
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
        INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
      END;
    `);
    ftsAvailable = true;
  } catch (e) {
    ftsAvailable = false;
    console.warn('[db] FTS5 unavailable, falling back to LIKE search:', e.message);
  }
}

export function addColumnIfMissing(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
}

// ---- Small helpers ----------------------------------------------------------

export function q(sql, ...params) {
  return db.prepare(sql).all(...params);
}
export function one(sql, ...params) {
  return db.prepare(sql).get(...params);
}
export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

// ---- Settings (JSON blobs in the settings table) ----------------------------

export function getSettings() {
  const row = one(`SELECT value FROM settings WHERE key = 'app'`);
  const stored = row ? JSON.parse(row.value) : {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    budgets: { ...DEFAULT_SETTINGS.budgets, ...(stored.budgets || {}) },
    models: { ...DEFAULT_SETTINGS.models, ...(stored.models || {}) },
    pricing: { ...DEFAULT_SETTINGS.pricing, ...(stored.pricing || {}) },
    maxOutputTokens: { ...DEFAULT_SETTINGS.maxOutputTokens, ...(stored.maxOutputTokens || {}) },
  };
}

export function saveSettings(patch) {
  const merged = { ...getSettings(), ...patch };
  run(
    `INSERT INTO settings(key, value) VALUES('app', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    JSON.stringify(merged)
  );
  return merged;
}

// ---- Users -------------------------------------------------------------------

export function ensureUsers() {
  const count = one(`SELECT COUNT(*) AS n FROM users`).n;
  if (count === 0) {
    run(`INSERT INTO users(name, email, role) VALUES(?, ?, 'admin')`, 'Will', 'wdgorgas@icloud.com');
    run(`INSERT INTO users(name, email, role) VALUES(?, ?, 'admin')`, 'Jackson', null);
  }
}

export function audit(userId, action, detail = null) {
  run(`INSERT INTO audit(user_id, action, detail) VALUES(?, ?, ?)`,
    userId ?? null, action, detail ? String(detail).slice(0, 2000) : null);
}

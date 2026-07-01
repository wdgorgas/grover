/**
 * Deferred Action Ledger — the "Doctor" pattern (master prompt §7.9).
 *
 * One generic, domain-tagged schema for everything that should eventually be
 * done but isn't being actioned right now. Builder's bugs/decisions/next
 * actions are just domain:grover-dev rows here — no separate tracker.
 */
import { q, one, run, audit } from './db.mjs';

export const DOMAINS = ['grover-dev', 'home-tech', 'health', 'business', 'research', 'personal-goal'];
export const CATEGORIES = ['repair', 'upgrade', 'follow-up', 'decision', 'opportunity', 'bug', 'feature'];
export const STATUSES = ['pending_greenlight', 'approved', 'deferred', 'rejected', 'done'];

export function listLedger({ domain, status, limit = 200 } = {}) {
  const where = [];
  const vals = [];
  if (domain && DOMAINS.includes(domain)) { where.push('domain = ?'); vals.push(domain); }
  if (status && STATUSES.includes(status)) { where.push('status = ?'); vals.push(status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return q(
    `SELECT * FROM ledger ${clause}
     ORDER BY CASE severity WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
              updated_at DESC
     LIMIT ?`,
    ...vals, limit
  );
}

export function createLedgerItem(fields, userName) {
  if (!DOMAINS.includes(fields.domain)) throw new Error(`Unknown domain: ${fields.domain}`);
  const res = run(
    `INSERT INTO ledger(item, domain, category, severity, cost_estimate, effort_estimate,
                        detected_by, status, linked_project, next_review, notes)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    fields.item,
    fields.domain,
    CATEGORIES.includes(fields.category) ? fields.category : 'follow-up',
    fields.severity || 'medium',
    fields.cost_estimate || null,
    fields.effort_estimate || null,
    fields.detected_by || userName || 'Will',
    STATUSES.includes(fields.status) ? fields.status : 'pending_greenlight',
    fields.linked_project || null,
    fields.next_review || null,
    fields.notes || null
  );
  return Number(res.lastInsertRowid);
}

export function updateLedgerItem(id, patch) {
  const fields = ['item', 'domain', 'category', 'severity', 'cost_estimate', 'effort_estimate',
    'linked_project', 'next_review', 'notes'];
  const sets = [];
  const vals = [];
  for (const f of fields) {
    if (patch[f] !== undefined) { sets.push(`${f} = ?`); vals.push(patch[f]); }
  }
  if (!sets.length) return;
  sets.push(`updated_at = datetime('now')`);
  run(`UPDATE ledger SET ${sets.join(', ')} WHERE id = ?`, ...vals, id);
}

/** Status transitions are audited — this is the greenlight trail. */
export function setLedgerStatus(id, status, userId, userName) {
  if (!STATUSES.includes(status)) throw new Error(`Bad status: ${status}`);
  run(
    `UPDATE ledger SET status = ?, greenlighter = ?, updated_at = datetime('now') WHERE id = ?`,
    status, userName || 'user', id
  );
  const item = one(`SELECT item FROM ledger WHERE id = ?`, id);
  audit(userId, `ledger_${status}`, `#${id} ${item?.item || ''}`);
}

/** Seed the v2 roadmap as grover-dev rows so Builder starts with real work queued. */
export function seedLedger() {
  const count = one(`SELECT COUNT(*) AS n FROM ledger`).n;
  if (count > 0) return;
  const rows = [
    ['Wire Grover to a real Anthropic API key and send first routed message', 'grover-dev', 'follow-up', 'high', 'First-run step. Settings → API key.'],
    ['Deploy to Ubuntu server behind Cloudflare Tunnel + Access', 'grover-dev', 'upgrade', 'high', 'See SECURITY.md for the full runbook. Bind 0.0.0.0 only after Access is in front.'],
    ['v2: pgvector/embeddings retrieval behind the Memory API', 'grover-dev', 'upgrade', 'medium', 'Only when FTS demonstrably falls short (§8.3). Memory API already isolates storage.'],
    ['v2: Loop Engine — bounded Discover→Plan→Execute→Verify→Summarize loops', 'grover-dev', 'feature', 'medium', 'Closed loops first. Schema sketch in ARCHITECTURE.md §Future.'],
    ['v2: Agent Team Manager (maker/checker split, scoped permissions)', 'grover-dev', 'feature', 'medium', 'Depends on Loop Engine.'],
    ['v2: GitHub integration for Builder (repo state, diffs, coding loops)', 'grover-dev', 'feature', 'medium', null],
    ['Decide: PIN/passphrase for local profile switch, or trust the machine?', 'grover-dev', 'decision', 'low', 'Cloudflare Access is the real gate once deployed. Local trust is the v1 default.'],
    ['Evaluate Pi/OMP as a Builder coding-agent backend', 'grover-dev', 'decision', 'low', 'Evaluation criteria in master prompt §19. Do not depend on by default.'],
  ];
  for (const [item, domain, category, severity, notes] of rows) {
    run(
      `INSERT INTO ledger(item, domain, category, severity, detected_by, status, notes)
       VALUES(?, ?, ?, ?, 'agent (Claude — kernel build)', 'pending_greenlight', ?)`,
      item, domain, category, severity, notes
    );
  }
}

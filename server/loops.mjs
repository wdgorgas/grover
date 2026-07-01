/**
 * Loop engine v1 (docs/LOOP_ENGINEERING.md).
 *
 * A loop is the tracked plan-of-record born from a greenlit ledger item:
 *   proposed → approved → running → verifying → done | killed
 *
 * At autonomy L1 a loop never executes anything. It is the structure a
 * human (or a future supervised runner) works from. Every transition is
 * audited. This module owns its own schema so adding it didn't require
 * touching the core db file (docs/DECISIONS.md #8).
 */
import { db, q, one, run, audit, getSettings } from './db.mjs';
import { completeMessage } from './anthropic.mjs';
import { modelForTier, computeCost } from './router.mjs';
import { getSkillByName } from './skills.mjs';

export const LOOP_STATUSES = ['proposed', 'approved', 'running', 'verifying', 'done', 'killed'];

export function ensureLoops() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS loops (
      id INTEGER PRIMARY KEY,
      ledger_id INTEGER NOT NULL REFERENCES ledger(id),
      goal TEXT NOT NULL,
      scope TEXT,                -- JSON array
      steps TEXT,                -- JSON array
      risk TEXT NOT NULL DEFAULT 'medium',
      risk_notes TEXT,
      effort_hours REAL,
      touches TEXT,              -- JSON array
      autonomy_level INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'proposed',
      offline INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_loops_status ON loops(status);
  `);
}

function parseLoop(row) {
  if (!row) return null;
  return {
    ...row,
    scope: safeJson(row.scope, []),
    steps: safeJson(row.steps, []),
    touches: safeJson(row.touches, []),
  };
}
function safeJson(s, fallback) {
  try { return JSON.parse(s) ?? fallback; } catch { return fallback; }
}

export function listLoops({ active } = {}) {
  const rows = active
    ? q(`SELECT * FROM loops WHERE status IN ('approved','running','verifying') ORDER BY updated_at DESC`)
    : q(`SELECT * FROM loops ORDER BY updated_at DESC LIMIT 100`);
  return rows.map(parseLoop);
}

export function activeLoop() {
  return parseLoop(one(
    `SELECT * FROM loops WHERE status IN ('running','verifying') ORDER BY updated_at DESC LIMIT 1`
  ) || one(
    `SELECT * FROM loops WHERE status = 'approved' ORDER BY updated_at DESC LIMIT 1`
  ));
}

export function loopForLedger(ledgerId) {
  return parseLoop(one(
    `SELECT * FROM loops WHERE ledger_id = ? AND status NOT IN ('done','killed')
     ORDER BY id DESC LIMIT 1`, ledgerId
  ));
}

/**
 * Generate a build proposal for a ledger item. Uses the smart tier; if no
 * API key is configured (or the call fails), returns an honest offline
 * skeleton the user can edit — the flow must teach even before Grover can
 * think. Stores nothing; the loop row is created only on approval.
 */
export async function generateProposal({ user, item }) {
  const settings = getSettings();
  const base = {
    ledgerId: item.id,
    autonomy_level: Math.min(settings.autonomyLevel, 1), // v1: loops run at ≤L1
    approval: 'Human approval required. At autonomy L1 nothing executes automatically — approving creates a tracked plan-of-record.',
  };

  try {
    const model = modelForTier('smart');
    const skillPrompt = item.domain === 'grover-dev' ? getSkillByName('Grover Architect')?.prompt : null;
    const started = Date.now();
    const { text, usage } = await completeMessage({
      model,
      system: [{
        type: 'text',
        text: `${skillPrompt || 'You are Grover, a pragmatic technical planner.'}

Turn one Deferred Action Ledger item into a build proposal. Output ONLY JSON:
{"goal": one sentence, "scope": [2-5 in-scope bullets], "out_of_scope": [1-3 bullets],
"steps": [3-7 concrete steps a human can execute], "risk": "low"|"medium"|"high",
"risk_notes": one sentence, "effort_hours": number, "touches": [files/systems/people]}.
Be concrete and honest; no filler.`,
      }],
      messages: [{
        role: 'user',
        content: `Item #${item.id}: ${item.item}\ndomain: ${item.domain} | category: ${item.category} | severity: ${item.severity}\nnotes: ${item.notes || '(none)'}${item.brief ? `\nexisting brief:\n${item.brief.slice(0, 1200)}` : ''}`,
      }],
      maxTokens: 800,
    });
    const cost = computeCost('smart', usage);
    run(
      `INSERT INTO model_calls(user_id, task_type, model, tier, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, cost, latency_ms)
       VALUES(?, 'loop_proposal', ?, 'smart', ?, ?, ?, ?, ?, ?)`,
      user.id, model, usage.input_tokens || 0, usage.output_tokens || 0,
      usage.cache_read_input_tokens || 0, usage.cache_creation_input_tokens || 0,
      cost, Date.now() - started
    );
    const p = salvageJsonObject(text);
    if (!p || !p.goal || !Array.isArray(p.steps)) throw new Error('Unparseable proposal');
    audit(user.id, 'loop_proposal', `ledger #${item.id}`);
    return { ...base, offline: false, cost, proposal: normalizeProposal(p, item) };
  } catch (err) {
    // Offline / failed path: honest skeleton, clearly labeled.
    audit(user.id, 'loop_proposal_offline', `ledger #${item.id}: ${err.code || err.message}`);
    return {
      ...base,
      offline: true,
      offlineReason: err.code === 'no_key'
        ? 'No API key configured — this is a skeleton, not Grover\'s plan. Add a key in Settings for a real proposal.'
        : `Proposal generation failed (${err.code || 'error'}) — skeleton shown instead.`,
      proposal: {
        goal: item.item,
        scope: ['Define exact scope during the first working session'],
        out_of_scope: ['Anything not needed to close this specific item'],
        steps: [
          'Clarify the outcome and constraints (use the item\'s Workshop thread)',
          'Break the work into checkable steps',
          'Do the work; keep notes on the item',
          'Verify against the definition of done, then mark the loop done',
        ],
        risk: item.severity === 'urgent' || item.severity === 'high' ? 'high' : 'medium',
        risk_notes: 'Unassessed — generated offline.',
        effort_hours: null,
        touches: [],
      },
    };
  }
}

function normalizeProposal(p, item) {
  return {
    goal: String(p.goal).slice(0, 300),
    scope: (p.scope || []).slice(0, 6).map(String),
    out_of_scope: (p.out_of_scope || []).slice(0, 4).map(String),
    steps: (p.steps || []).slice(0, 8).map(String),
    risk: ['low', 'medium', 'high'].includes(p.risk) ? p.risk : 'medium',
    risk_notes: String(p.risk_notes || '').slice(0, 300),
    effort_hours: Number.isFinite(Number(p.effort_hours)) ? Number(p.effort_hours) : null,
    touches: (p.touches || []).slice(0, 8).map(String),
  };
}

/** Approval: creates the loop (status approved) and approves the ledger item. */
export function approveLoop({ user, item, proposal, offline }) {
  const existing = loopForLedger(item.id);
  if (existing) return existing; // idempotent: one open loop per item
  const res = run(
    `INSERT INTO loops(ledger_id, goal, scope, steps, risk, risk_notes, effort_hours, touches,
       autonomy_level, status, offline)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`,
    item.id,
    proposal.goal,
    JSON.stringify([...(proposal.scope || []), ...(proposal.out_of_scope || []).map((s) => `OUT: ${s}`)]),
    JSON.stringify(proposal.steps || []),
    proposal.risk || 'medium',
    proposal.risk_notes || null,
    proposal.effort_hours ?? null,
    JSON.stringify(proposal.touches || []),
    1,
    offline ? 1 : 0
  );
  const id = Number(res.lastInsertRowid);
  run(`UPDATE ledger SET status = 'approved', greenlighter = ?, updated_at = datetime('now') WHERE id = ?`,
    user.name, item.id);
  audit(user.id, 'loop_approved', `loop #${id} ← ledger #${item.id}: ${proposal.goal.slice(0, 80)}`);
  return parseLoop(one(`SELECT * FROM loops WHERE id = ?`, id));
}

export function setLoopStatus({ user, loopId, status, summary }) {
  if (!LOOP_STATUSES.includes(status)) throw new Error(`Bad loop status: ${status}`);
  const loop = one(`SELECT * FROM loops WHERE id = ?`, loopId);
  if (!loop) throw new Error('No such loop');
  run(
    `UPDATE loops SET status = ?, summary = COALESCE(?, summary), updated_at = datetime('now') WHERE id = ?`,
    status, summary || null, loopId
  );
  if (status === 'done') {
    run(`UPDATE ledger SET status = 'done', updated_at = datetime('now') WHERE id = ?`, loop.ledger_id);
  }
  audit(user.id, `loop_${status}`, `loop #${loopId}${summary ? `: ${String(summary).slice(0, 120)}` : ''}`);
  return parseLoop(one(`SELECT * FROM loops WHERE id = ?`, loopId));
}

/** System state for the status surfaces (/api/status). */
export function systemStatus() {
  const s = getSettings();
  const loop = activeLoop();
  const pending = one(`SELECT COUNT(*) AS n FROM ledger WHERE status = 'pending_greenlight'`).n;
  const queued = one(`SELECT COUNT(*) AS n FROM loops WHERE status = 'approved'`).n;
  const spentToday = one(`SELECT COALESCE(SUM(cost),0) AS c FROM model_calls WHERE date(created_at) = date('now')`).c;
  const next = [];
  if (loop) {
    next.push(loop.status === 'approved'
      ? `Start loop #${loop.id}: ${loop.goal.slice(0, 60)}`
      : `Continue loop #${loop.id} (${loop.status}): ${loop.goal.slice(0, 60)}`);
  }
  if (pending > 0) next.push(`${pending} ledger item${pending === 1 ? '' : 's'} awaiting greenlight`);
  if (next.length === 0) next.push('Nothing queued — log work in the Ledger or talk to a Desk.');
  return {
    autonomyLevel: s.autonomyLevel,
    executionLevel: 1, // what the kernel actually acts at in v1
    activeLoop: loop,
    counts: { pendingGreenlight: pending, queuedLoops: queued },
    spend: { today: Math.round(spentToday * 10000) / 10000, dailyCap: s.budgets.dailyUsd },
    models: s.models,
    nextActions: next.slice(0, 3),
  };
}

function salvageJsonObject(text) {
  try { return JSON.parse(text); } catch { /* try harder */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* give up */ } }
  return null;
}

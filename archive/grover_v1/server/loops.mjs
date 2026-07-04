/**
 * Loop engine v2 (docs/LOOP_ENGINEERING.md).
 *
 * A loop is the tracked plan-of-record born from an approved proposal:
 *   proposed → approved → ready → running → verifying → done
 *                    ↘ blocked (with a reason) ↗    ↘ killed / rejected
 *
 * Every transition is enforced against a state machine, audited, and written
 * to loop_events — each loop carries its own inspectable history. This module
 * owns its own schema so extending it never touches the core db file
 * (docs/DECISIONS.md #8).
 *
 * Three doors into a loop, two policies (AGENT_POLICY.md):
 *  - Direct request (Path 1): typed by a human → ledger item + loop created
 *    approved+running in one step, handed straight to the runner.
 *  - Greenlight (Path 2): an existing ledger item → proposal → approval → loop.
 *  - Improvement Request (Path 2): reserved for Grover-initiated improvements
 *    → drafted item + proposal → human approval → loop.
 *
 * Completion is evidence-gated: a loop cannot reach 'done' without
 * execution_evidence (a runner run) or an explicit manual attestation.
 */
import { db, q, one, run, audit, getSettings, addColumnIfMissing } from './db.mjs';
import { completeMessage } from './anthropic.mjs';
import { modelForTier, computeCost } from './router.mjs';
import { getSkillByName } from './skills.mjs';
import { createLedgerItem, CATEGORIES } from './ledger.mjs';

export const LOOP_STATUSES = [
  'proposed', 'approved', 'ready', 'running', 'verifying', 'blocked', 'done', 'killed', 'rejected',
];
export const OPEN_LOOP_STATUSES = ['proposed', 'approved', 'ready', 'running', 'verifying', 'blocked'];

/** The state machine. A transition not listed here is rejected, not fudged. */
export const LOOP_TRANSITIONS = {
  proposed: ['approved', 'rejected', 'killed'],
  approved: ['ready', 'running', 'blocked', 'killed'],
  ready: ['running', 'blocked', 'killed'],
  running: ['verifying', 'blocked', 'killed'],
  verifying: ['done', 'running', 'blocked', 'killed'],
  blocked: ['ready', 'running', 'killed'],
  done: [],
  killed: [],
  rejected: [],
};

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

    CREATE TABLE IF NOT EXISTS loop_events (
      id INTEGER PRIMARY KEY,
      loop_id INTEGER NOT NULL REFERENCES loops(id),
      event TEXT NOT NULL,           -- proposed | status | note | exec
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      actor TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_loop_events_loop ON loop_events(loop_id);
  `);
  // Additive migrations — safe on existing databases (PQ3).
  addColumnIfMissing('loops', 'verify_plan', 'TEXT');       // JSON array of checks
  addColumnIfMissing('loops', 'rollback', 'TEXT');
  addColumnIfMissing('loops', 'cost_estimate', 'TEXT');
  addColumnIfMissing('loops', 'blocked_reason', 'TEXT');
  addColumnIfMissing('loops', 'source', `TEXT NOT NULL DEFAULT 'greenlight'`);
  // Runner v0: JSON evidence (files + diffs + verify output) gating 'done'.
  addColumnIfMissing('loops', 'execution_evidence', 'TEXT');
}

function parseLoop(row) {
  if (!row) return null;
  return {
    ...row,
    scope: safeJson(row.scope, []),
    steps: safeJson(row.steps, []),
    touches: safeJson(row.touches, []),
    verify_plan: safeJson(row.verify_plan, []),
    execution_evidence: safeJson(row.execution_evidence, null),
  };
}
function safeJson(s, fallback) {
  try { return JSON.parse(s) ?? fallback; } catch { return fallback; }
}

export function listLoops({ active } = {}) {
  const rows = active
    ? q(`SELECT * FROM loops WHERE status IN ('approved','ready','running','verifying','blocked') ORDER BY updated_at DESC`)
    : q(`SELECT * FROM loops ORDER BY updated_at DESC LIMIT 100`);
  return rows.map(parseLoop);
}

export function activeLoop() {
  return parseLoop(one(
    `SELECT * FROM loops WHERE status IN ('running','verifying') ORDER BY updated_at DESC LIMIT 1`
  ) || one(
    `SELECT * FROM loops WHERE status IN ('ready','approved') ORDER BY updated_at DESC LIMIT 1`
  ));
}

export function loopForLedger(ledgerId) {
  return parseLoop(one(
    `SELECT * FROM loops WHERE ledger_id = ? AND status NOT IN ('done','killed','rejected')
     ORDER BY id DESC LIMIT 1`, ledgerId
  ));
}

// ---- Loop events (per-loop auditable history) --------------------------------

export function loopEvent(loopId, { event = 'status', from = null, to = null, note = null, actor = null }) {
  run(
    `INSERT INTO loop_events(loop_id, event, from_status, to_status, note, actor)
     VALUES(?, ?, ?, ?, ?, ?)`,
    loopId, event, from, to, note ? String(note).slice(0, 500) : null, actor
  );
}

export function listLoopEvents(loopId) {
  return q(`SELECT * FROM loop_events WHERE loop_id = ? ORDER BY id`, loopId);
}

// ---- Proposal generation (shared by Greenlight and Improvement Request) -------

const PROPOSAL_SHAPE = `{"goal": one sentence, "scope": [2-5 in-scope bullets], "out_of_scope": [1-3 bullets],
"steps": [3-7 concrete steps a human can execute], "risk": "low"|"medium"|"high",
"risk_notes": one sentence, "effort_hours": number, "touches": [files/systems likely touched],
"verification": [2-4 concrete checks that prove it worked, e.g. "npm run verify passes"],
"rollback": one sentence on how to undo this if it goes wrong,
"cost_estimate": short honest string, e.g. "$0 API / ~1h human" or "unknown until scoped"}`;

const OFFLINE_PROPOSAL_EXTRAS = {
  verification: [
    'npm run verify passes after the change',
    'Manually exercise the changed flow end-to-end',
  ],
  rollback: 'Revert the change in git — no data migration involved unless scoping says otherwise.',
  cost_estimate: 'unestimated (offline skeleton)',
};

function proposalBase(settings) {
  return {
    // Honest — no hidden cap. Raising this dial does not change whether Path 2
    // waits for you (it always does, by your own standing rule, not the
    // dial's) — it's forward-looking, for money/spend autonomy (§6 L3-5)
    // once those tools exist. Don't silently clamp it; that's what made the
    // control feel broken.
    autonomy_level: settings.autonomyLevel,
    approval: 'Human approval required — always, by design, regardless of this dial. Path 2 (Grover-initiated work) never executes without your greenlight. Path 1 (anything you type directly) already runs instantly and this dial doesn\'t change that either. Today the dial mainly matters for future money/spend autonomy; nothing at L3-5 exists yet to gate.',
  };
}

/**
 * Generate a build proposal for an existing ledger item (Greenlight door).
 * If no API key is configured (or the call fails), returns an honest offline
 * skeleton the user can edit — the flow must teach even before Grover can
 * think. Stores nothing; the loop row is created only on approval.
 */
export async function generateProposal({ user, item }) {
  const settings = getSettings();
  const base = { ledgerId: item.id, ...proposalBase(settings) };
  try {
    const { parsed, cost } = await callPlanner({
      user,
      taskType: 'loop_proposal',
      system: `Turn one Deferred Action Ledger item into a build proposal. Output ONLY JSON:\n${PROPOSAL_SHAPE}.\nBe concrete and honest; no filler.`,
      prompt: `Item #${item.id}: ${item.item}\ndomain: ${item.domain} | category: ${item.category} | severity: ${item.severity}\nnotes: ${item.notes || '(none)'}${item.brief ? `\nexisting brief:\n${item.brief.slice(0, 1200)}` : ''}`,
      useArchitect: item.domain === 'grover-dev',
    });
    if (!parsed || !parsed.goal || !Array.isArray(parsed.steps)) throw new Error('Unparseable proposal');
    audit(user.id, 'loop_proposal', `ledger #${item.id}`);
    return { ...base, offline: false, cost, proposal: normalizeProposal(parsed) };
  } catch (err) {
    audit(user.id, 'loop_proposal_offline', `ledger #${item.id}: ${err.code || err.message}`);
    return {
      ...base,
      offline: true,
      offlineReason: offlineReason(err),
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
        ...OFFLINE_PROPOSAL_EXTRAS,
      },
    };
  }
}

/**
 * Improvement Request door (Path 2 — Grover-initiated improvements only;
 * direct human requests go through createDirectRun instead): free text →
 * drafted ledger item fields + full build proposal. Persists nothing —
 * the user approves, edits, saves, or rejects it first.
 */
export async function draftImprovement({ user, request }) {
  const settings = getSettings();
  const base = proposalBase(settings);
  try {
    const { parsed, cost } = await callPlanner({
      user,
      taskType: 'improvement_draft',
      system: `A user of GROVER (a local, zero-dependency Node+vanilla-JS self-hosted AI command center) is requesting an improvement to the app itself. Turn the request into a work item + build proposal. Output ONLY JSON:
{"title": short imperative work-item title (max 100 chars),
"category": "feature"|"bug"|"upgrade"|"repair"|"decision",
"severity": "low"|"medium"|"high",
${PROPOSAL_SHAPE.slice(1)}.
Be concrete and honest; no filler. touches should name likely files (client/js/*.js, server/*.mjs, docs/*).`,
      prompt: `Improvement request from ${user.name}: ${request}`,
      useArchitect: true,
    });
    if (!parsed || !parsed.goal || !Array.isArray(parsed.steps)) throw new Error('Unparseable proposal');
    audit(user.id, 'improvement_draft', request.slice(0, 120));
    return {
      ...base,
      offline: false,
      cost,
      draft: normalizeDraft(parsed, request),
      proposal: normalizeProposal(parsed),
    };
  } catch (err) {
    audit(user.id, 'improvement_draft_offline', `${request.slice(0, 80)}: ${err.code || err.message}`);
    return {
      ...base,
      offline: true,
      offlineReason: offlineReason(err),
      draft: { title: request.slice(0, 100), category: 'feature', severity: 'medium' },
      proposal: {
        goal: request.slice(0, 300),
        scope: ['Define exact scope during the first working session'],
        out_of_scope: ['Anything not needed for this specific improvement'],
        steps: [
          'Scope the change precisely (which view, which interaction)',
          'Implement the smallest version that fully works',
          'Run npm run verify and exercise the flow by hand',
          'Close the loop with a one-line summary of what changed',
        ],
        risk: 'medium',
        risk_notes: 'Unassessed — generated offline.',
        effort_hours: null,
        touches: [],
        ...OFFLINE_PROPOSAL_EXTRAS,
      },
    };
  }
}

function offlineReason(err) {
  return err.code === 'no_key'
    ? 'No API key configured — this is a skeleton, not Grover\'s plan. Add a key in Settings for a real proposal.'
    : `Proposal generation failed (${err.code || 'error'}) — skeleton shown instead.`;
}

/** One seam for the planner LLM call: model, logging, JSON salvage. */
async function callPlanner({ user, taskType, system, prompt, useArchitect }) {
  const model = modelForTier('smart');
  const skillPrompt = useArchitect ? getSkillByName('Grover Architect')?.prompt : null;
  const started = Date.now();
  const { text, usage } = await completeMessage({
    model,
    system: [{
      type: 'text',
      text: `${skillPrompt || 'You are Grover, a pragmatic technical planner.'}\n\n${system}`,
    }],
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1000,
  });
  const cost = computeCost('smart', usage);
  run(
    `INSERT INTO model_calls(user_id, task_type, model, tier, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, cost, latency_ms)
     VALUES(?, ?, ?, 'smart', ?, ?, ?, ?, ?, ?)`,
    user.id, taskType, model, usage.input_tokens || 0, usage.output_tokens || 0,
    usage.cache_read_input_tokens || 0, usage.cache_creation_input_tokens || 0,
    cost, Date.now() - started
  );
  return { parsed: salvageJsonObject(text), cost };
}

function normalizeDraft(p, request) {
  return {
    title: String(p.title || request).slice(0, 100),
    category: CATEGORIES.includes(p.category) ? p.category : 'feature',
    severity: ['low', 'medium', 'high', 'urgent'].includes(p.severity) ? p.severity : 'medium',
  };
}

function normalizeProposal(p) {
  return {
    goal: String(p.goal).slice(0, 300),
    scope: (p.scope || []).slice(0, 6).map(String),
    out_of_scope: (p.out_of_scope || []).slice(0, 4).map(String),
    steps: (p.steps || []).slice(0, 8).map(String),
    risk: ['low', 'medium', 'high'].includes(p.risk) ? p.risk : 'medium',
    risk_notes: String(p.risk_notes || '').slice(0, 300),
    effort_hours: Number.isFinite(Number(p.effort_hours)) ? Number(p.effort_hours) : null,
    touches: (p.touches || []).slice(0, 8).map(String),
    verification: (p.verification || []).slice(0, 5).map(String),
    rollback: String(p.rollback || '').slice(0, 300),
    cost_estimate: String(p.cost_estimate || '').slice(0, 120),
  };
}

// ---- Approval and lifecycle ----------------------------------------------------

/** Approval: creates the loop (status approved) and approves the ledger item. */
export function approveLoop({ user, item, proposal, offline, source = 'greenlight' }) {
  const existing = loopForLedger(item.id);
  if (existing) return existing; // idempotent: one open loop per item
  const res = run(
    `INSERT INTO loops(ledger_id, goal, scope, steps, risk, risk_notes, effort_hours, touches,
       verify_plan, rollback, cost_estimate, autonomy_level, status, offline, source)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`,
    item.id,
    proposal.goal,
    JSON.stringify([...(proposal.scope || []), ...(proposal.out_of_scope || []).map((s) => `OUT: ${s}`)]),
    JSON.stringify(proposal.steps || []),
    proposal.risk || 'medium',
    proposal.risk_notes || null,
    proposal.effort_hours ?? null,
    JSON.stringify(proposal.touches || []),
    JSON.stringify(proposal.verification || []),
    proposal.rollback || null,
    proposal.cost_estimate || null,
    1,
    offline ? 1 : 0,
    source
  );
  const id = Number(res.lastInsertRowid);
  run(`UPDATE ledger SET status = 'approved', greenlighter = ?, updated_at = datetime('now') WHERE id = ?`,
    user.name, item.id);
  loopEvent(id, {
    event: 'proposed', to: 'proposed', actor: user.name,
    note: `${source === 'improvement' ? 'Improvement request' : 'Greenlight'} proposal${offline ? ' (offline skeleton)' : ''}: ${proposal.goal.slice(0, 120)}`,
  });
  loopEvent(id, { from: 'proposed', to: 'approved', actor: user.name, note: `Approved by ${user.name}` });
  audit(user.id, 'loop_approved', `loop #${id} ← ledger #${item.id}: ${proposal.goal.slice(0, 80)}`);
  return parseLoop(one(`SELECT * FROM loops WHERE id = ?`, id));
}

/**
 * Improvement Request decision. Nothing was persisted at draft time; this is
 * where the user's choice lands:
 *   approve → ledger item + loop created together (same path as Greenlight)
 *   save    → ledger item pending_greenlight, proposal stored as its brief
 *   reject  → nothing persisted; the decision itself is audited
 */
export function decideImprovement({ user, request, draft, proposal, offline, decision }) {
  if (decision === 'reject') {
    audit(user.id, 'improvement_rejected', request.slice(0, 160));
    return { decision };
  }
  const itemId = createLedgerItem({
    item: draft.title,
    domain: 'grover-dev',
    category: draft.category,
    severity: draft.severity,
    detected_by: user.name,
    notes: `Improvement request: ${request.slice(0, 500)}`,
  }, user.name);
  audit(user.id, 'ledger_create', `#${itemId} ${draft.title.slice(0, 80)} (improvement request)`);
  run(`UPDATE ledger SET brief = ? WHERE id = ?`, proposalToBrief(proposal), itemId);
  if (decision === 'save') {
    audit(user.id, 'improvement_saved', `ledger #${itemId}: ${draft.title.slice(0, 80)}`);
    return { decision, itemId };
  }
  const item = one(`SELECT * FROM ledger WHERE id = ?`, itemId);
  const loop = approveLoop({ user, item, proposal, offline, source: 'improvement' });
  return { decision, itemId, loop };
}

/** Saved proposals stay readable (and greenlightable) as the item's brief. */
function proposalToBrief(p) {
  const lines = [
    `**Goal.** ${p.goal}`,
    '',
    `**Scope.** ${(p.scope || []).join('; ')}${p.out_of_scope?.length ? ` — out: ${p.out_of_scope.join('; ')}` : ''}`,
    '',
    '**Plan.**',
    ...(p.steps || []).map((s, i) => `${i + 1}. ${s}`),
    '',
    `**Risk.** ${p.risk}${p.risk_notes ? ` — ${p.risk_notes}` : ''}`,
    `**Verification.** ${(p.verification || []).join('; ') || 'to be defined'}`,
    `**Rollback.** ${p.rollback || 'to be defined'}`,
    `**Estimate.** ${p.cost_estimate || 'unestimated'}${p.effort_hours != null ? ` (~${p.effort_hours}h)` : ''}`,
  ];
  return lines.join('\n');
}

// ---- Direct execution (Path 1) ---------------------------------------------------

/** Light keyword routing; grover-dev unless the request is obviously elsewhere. */
const DOMAIN_HINTS = [
  ['home-tech', /\b(home assistant|home network|router|nas|plex|smart home|thermostat|wifi|media server)\b/i],
  ['health', /\b(workout|exercise plan|diet|sleep|doctor|medical|health)\b/i],
  ['business', /\b(invoice|client outreach|marketing|revenue|business plan|customer)\b/i],
  ['research', /\b(literature|research question|paper|study design|hypothesis)\b/i],
];
export function detectDomain(text) {
  for (const [domain, re] of DOMAIN_HINTS) if (re.test(text)) return domain;
  return 'grover-dev';
}

/**
 * Path 1: a request typed directly by a human executes immediately at
 * effective L2 — no proposal, no pending_greenlight. Creates (or reuses)
 * the ledger item as 'approved' and puts its loop into 'running', ready to
 * hand to the runner. Budget gates still apply inside the runner.
 */
export function createDirectRun({ user, request, itemId }) {
  let item;
  if (itemId) {
    item = one(`SELECT * FROM ledger WHERE id = ?`, Number(itemId));
    if (!item) throw Object.assign(new Error('No such ledger item'), { code: 'bad_request' });
    if (['done', 'rejected', 'dismissed'].includes(item.status)) {
      throw Object.assign(new Error(`Item #${item.id} is ${item.status} — revive it first.`), { code: 'bad_request' });
    }
    if (item.status !== 'approved') {
      run(`UPDATE ledger SET status = 'approved', greenlighter = ?, updated_at = datetime('now') WHERE id = ?`,
        user.name, item.id);
      audit(user.id, 'ledger_approved', `#${item.id} (direct execution by ${user.name})`);
      item = one(`SELECT * FROM ledger WHERE id = ?`, item.id);
    }
  } else {
    const text = String(request).trim();
    const id = createLedgerItem({
      item: text.slice(0, 140),
      domain: detectDomain(text),
      category: 'feature',
      severity: 'medium',
      detected_by: user.name,
      status: 'approved',
      notes: text.length > 140 ? `Direct request: ${text.slice(0, 1500)}` : null,
    }, user.name);
    run(`UPDATE ledger SET greenlighter = ? WHERE id = ?`, user.name, id);
    audit(user.id, 'ledger_create', `#${id} (direct request) ${text.slice(0, 80)}`);
    item = one(`SELECT * FROM ledger WHERE id = ?`, id);
  }

  let loop = loopForLedger(item.id);
  if (loop) {
    if (loop.status === 'proposed') loop = setLoopStatus({ user, loopId: loop.id, status: 'approved' });
    if (loop.status !== 'running') {
      loop = setLoopStatus({ user, loopId: loop.id, status: 'running', summary: null, reason: null });
    }
  } else {
    const goal = (request || item.item).slice(0, 300);
    const res = run(
      `INSERT INTO loops(ledger_id, goal, scope, steps, risk, touches, verify_plan,
         autonomy_level, status, offline, source)
       VALUES(?, ?, '[]', '[]', 'medium', '[]', ?, 2, 'running', 0, 'direct')`,
      item.id, goal, JSON.stringify(['node scripts/verify.mjs --server-only passes'])
    );
    const id = Number(res.lastInsertRowid);
    loopEvent(id, {
      event: 'proposed', to: 'running', actor: user.name,
      note: `Direct request by ${user.name} — executes immediately at effective L2 (Path 1)`,
    });
    audit(user.id, 'loop_direct', `loop #${id} ← ledger #${item.id}: ${goal.slice(0, 80)}`);
    loop = parseLoop(one(`SELECT * FROM loops WHERE id = ?`, id));
  }
  return { item, loop };
}

export function setLoopStatus({ user, loopId, status, summary, reason, manualEvidence }) {
  if (!LOOP_STATUSES.includes(status)) {
    throw Object.assign(new Error(`Bad loop status: ${status}`), { code: 'bad_request' });
  }
  const loop = one(`SELECT * FROM loops WHERE id = ?`, loopId);
  if (!loop) throw Object.assign(new Error('No such loop'), { code: 'bad_request' });
  const allowed = LOOP_TRANSITIONS[loop.status] || [];
  if (!allowed.includes(status)) {
    throw Object.assign(
      new Error(`Illegal transition: ${loop.status} → ${status}. Allowed from ${loop.status}: ${allowed.join(', ') || 'none (terminal)'}.`),
      { code: 'bad_request' }
    );
  }
  if (status === 'blocked' && !(reason && String(reason).trim())) {
    throw Object.assign(new Error('Blocking a loop requires a reason.'), { code: 'bad_request' });
  }
  // The DONE gate: no completion without evidence. Either the runner attached
  // execution_evidence, or the caller attests in writing to what a human did.
  if (status === 'done' && !loop.execution_evidence) {
    const manual = manualEvidence && String(manualEvidence).trim();
    if (!manual) {
      throw Object.assign(
        new Error('Marking a loop done requires evidence: run it through the runner, or supply manual_evidence — a written attestation of what was actually done and how it was verified.'),
        { code: 'bad_request' }
      );
    }
    run(`UPDATE loops SET execution_evidence = ? WHERE id = ?`,
      JSON.stringify({ manual: true, text: manual.slice(0, 2000), attested_by: user.name }), loopId);
  }
  run(
    `UPDATE loops SET status = ?, summary = COALESCE(?, summary),
       blocked_reason = ?, updated_at = datetime('now') WHERE id = ?`,
    status, summary || null,
    status === 'blocked' ? String(reason).trim().slice(0, 300) : null,
    loopId
  );
  if (status === 'done') {
    run(`UPDATE ledger SET status = 'done', updated_at = datetime('now') WHERE id = ?`, loop.ledger_id);
  }
  const note = status === 'blocked' ? String(reason).trim() : (summary || null);
  loopEvent(loopId, { from: loop.status, to: status, actor: user.name, note });
  audit(user.id, `loop_${status}`, `loop #${loopId}${note ? `: ${String(note).slice(0, 120)}` : ''}`);
  return parseLoop(one(`SELECT * FROM loops WHERE id = ?`, loopId));
}

// ---- System status ---------------------------------------------------------------

/** System state for the status surfaces (/api/status). */
export function systemStatus() {
  const s = getSettings();
  const loop = activeLoop();
  const pending = one(`SELECT COUNT(*) AS n FROM ledger WHERE status = 'pending_greenlight'`).n;
  // Waiting loops, richest fields first — these back the Command Center's
  // draggable task widgets (client/js/app.js renderQueueWidgets), not just a
  // count, so "waiting to be completed" tasks are real drag sources at home.
  const queueRows = q(
    `SELECT id, ledger_id, goal, status, risk FROM loops WHERE status IN ('approved','ready')
     ORDER BY updated_at DESC LIMIT 8`
  );
  const queued = queueRows.length;
  const blocked = q(`SELECT id, goal, blocked_reason FROM loops WHERE status = 'blocked' ORDER BY updated_at DESC`);
  const spentToday = one(`SELECT COALESCE(SUM(cost),0) AS c FROM model_calls WHERE date(created_at) = date('now')`).c;
  const next = [];
  if (loop) {
    next.push(['approved', 'ready'].includes(loop.status)
      ? `Start loop #${loop.id}: ${loop.goal.slice(0, 60)}`
      : loop.status === 'verifying'
        ? `Review loop #${loop.id}'s evidence: ${(loop.verify_plan[0] || loop.goal).slice(0, 60)}`
        : `Continue loop #${loop.id} (${loop.status}): ${loop.goal.slice(0, 60)}`);
  }
  for (const b of blocked.slice(0, 2)) {
    next.push(`Unblock loop #${b.id}: ${(b.blocked_reason || b.goal).slice(0, 60)}`);
  }
  if (pending > 0) next.push(`${pending} ledger item${pending === 1 ? '' : 's'} awaiting greenlight`);
  if (next.length === 0) next.push('Nothing queued — type a request in the Builder or log work in the Ledger.');
  return {
    autonomyLevel: s.autonomyLevel,
    // Honest floor, not a hardcoded literal: Path 1 always runs at least at
    // L2 (§6.1's guaranteed minimum), but reflect a higher configured dial
    // rather than silently reporting "2" no matter what you set.
    executionLevel: Math.max(2, s.autonomyLevel),
    activeLoop: loop,
    queueItems: queueRows,
    counts: { pendingGreenlight: pending, queuedLoops: queued, blockedLoops: blocked.length },
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

import { randomUUID, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { appendEvent, appendEventInTransaction, type Actor, type Phase } from './events.ts';

export type Intent = 'ask' | 'work' | 'act' | 'build' | 'remember';
export type Context = 'general' | 'coding' | 'research' | 'finance' | 'health' | 'business' | 'builder';

export const CONTEXTS: { id: Context; label: string; description: string }[] = [
  { id: 'coding', label: 'Coding', description: 'Software, tools, automation, and technical projects' },
  { id: 'research', label: 'Research', description: 'Questions, evidence, sources, and analysis' },
  { id: 'finance', label: 'Finance', description: 'Markets, budgets, investing, and quantitative work' },
  { id: 'health', label: 'Health', description: 'Health, fitness, food, and wellbeing' },
  { id: 'business', label: 'Business', description: 'Plans, operations, writing, and decisions' },
  { id: 'builder', label: 'GROVER', description: 'Changes to this application' },
];

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

export function inferIntent(text: string): Intent {
  const normalized = text.trim().toLowerCase();
  if (/^(remember|save this|keep this in mind)\b/.test(normalized)) return 'remember';
  if (/\b(change|build|add|fix|update|remove|implement|redesign|refactor|create)\b/.test(normalized) &&
      /\bgrover\b/.test(normalized)) return 'build';
  if (/^(send|publish|buy|purchase|delete|deploy|email|message|schedule)\b/.test(normalized)) return 'act';
  if (/^(let'?s\s+)?(write|draft|analyze|research|summarize|create|prepare|design|plan|compare|build|implement)\b/.test(normalized)) return 'work';
  return 'ask';
}

export function inferContext(text: string, intent: Intent = inferIntent(text)): Context {
  const normalized = text.trim().toLowerCase();
  if (intent === 'build' || (/\bgrover\b/.test(normalized) && /\b(app|interface|feature|setting|code|fix|change)\b/.test(normalized))) {
    return 'builder';
  }
  if (/\b(health|medical|doctor|symptom|medicine|medication|workout|exercise|fitness|nutrition|diet|sleep|wellness)\b/.test(normalized)) {
    return 'health';
  }
  if (/\b(finance|financial|money|budget|invest|investment|stock|market|portfolio|trading|quant|loan|mortgage|tax|retirement)\b/.test(normalized)) {
    return 'finance';
  }
  if (/\b(code|coding|software|developer|programming|python|javascript|typescript|repository|repo|api|database|website|platform|debug|algorithm)\b/.test(normalized)) {
    return 'coding';
  }
  if (/\b(research|paper|study|evidence|source|citation|literature|fact.?check|analyze data|dataset)\b/.test(normalized)) {
    return 'research';
  }
  if (/\b(business|company|customer|sales|marketing|strategy|operations|revenue|proposal|client|startup)\b/.test(normalized)) {
    return 'business';
  }
  return 'general';
}

function conversationTitle(text: string): string {
  const title = text.replace(/\s+/g, ' ').trim().replace(/^let'?s\s+/i, '');
  return title.length <= 72 ? title : `${title.slice(0, 71)}…`;
}

export function createConversation(db: DatabaseSync, context: Context, text: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  transaction(db, () => {
    db.prepare('INSERT INTO conversations(id, context, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, context, conversationTitle(text), now, now);
    db.prepare(
      'INSERT INTO context_routing_decisions(conversation_id, initial_context, final_context, rule_version, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, context, context, 'keywords-v1', now);
  });
  return id;
}

export function getConversation(db: DatabaseSync, id: string): { id: string; context: Context; title: string } | undefined {
  return db.prepare('SELECT id, context, title FROM conversations WHERE id = ?').get(id) as
    { id: string; context: Context; title: string } | undefined;
}

export function moveConversation(db: DatabaseSync, id: string, context: Context): void {
  const now = new Date().toISOString();
  transaction(db, () => {
    const result = db.prepare('UPDATE conversations SET context = ?, updated_at = ? WHERE id = ?').run(context, now, id);
    if (result.changes !== 1) throw new Error('That conversation is no longer available.');
    db.prepare(
      'UPDATE context_routing_decisions SET final_context = ?, corrected_at = ? WHERE conversation_id = ?'
    ).run(context, now, id);
  });
}

export function addConversationMessage(
  db: DatabaseSync,
  conversationId: string,
  taskId: string | null,
  role: 'user' | 'assistant' | 'system',
  content: string,
  state: 'pending' | 'complete' | 'failed' = 'complete',
): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  transaction(db, () => {
    db.prepare(
      'INSERT INTO conversation_messages(id, conversation_id, task_id, role, content, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, conversationId, taskId, role, content, state, now);
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
  });
  return id;
}

export function createTask(db: DatabaseSync, intent: Intent, text: string, context: Context = inferContext(text, intent)): string {
  const taskId = randomUUID();
  appendEvent(db, {
    scopeType: 'task',
    scopeId: taskId,
    taskId,
    idempotencyKey: `${taskId}:created`,
    actor: 'will',
    domain: context,
    phase: 'intake',
    plainLanguage: intent === 'build' ? 'Preparing a GROVER change' : `Starting ${intent}`,
    internalDetail: JSON.stringify({ intent, request: text }),
  });
  return taskId;
}

export function createBuild(db: DatabaseSync, taskId: string, text: string, engineId = 'codex-cli'): { featureId: string; runId: string } {
  const featureId = randomUUID();
  const runId = randomUUID();
  const createdAt = new Date().toISOString();
  const title = text.trim().replace(/\s+/g, ' ').slice(0, 100);
  transaction(db, () => {
    db.prepare(
      `INSERT INTO feature_requests
        (id, title, description, origin, domain, status, created_by, created_at, updated_at,
         signoff_state, estimated_cost, actual_cost, active_build_run_id)
       VALUES (?, ?, ?, 'will_direct', 'builder', 'running', 'will', ?, ?, 'not_required', ?, 0, ?)`
    ).run(featureId, title, text, createdAt, createdAt, 1_000_000, runId);
    db.prepare(
      `INSERT INTO build_runs
        (id, feature_request_id, task_id, engine_id, status, current_phase, started_at, cost_estimate)
       VALUES (?, ?, ?, ?, 'queued', 'queued', ?, ?)`
    ).run(runId, featureId, taskId, engineId, createdAt, 1_000_000);

    const checks = [
      ['automated-tests', 'Automated checks pass', 'Run the project test suite after the change', 'integration', '["test_output"]'],
      ['recorded-change', 'Change is inspectable', 'Record the exact repository diff and commit', 'api_or_state', '["git_diff","commit"]'],
    ];
    for (const [suffix, titleText, description, type, evidence] of checks) {
      db.prepare(
        `INSERT INTO acceptance_checks
          (id, feature_request_id, build_run_id, title, description, check_type,
           required_evidence_types, status, passes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 'system')`
      ).run(`${runId}:${suffix}`, featureId, runId, titleText, description, type, evidence);
    }
    appendEventInTransaction(db, {
      scopeType: 'feature_request', scopeId: featureId, taskId, buildRunId: runId,
      idempotencyKey: `${runId}:queued`, actor: 'system', domain: 'builder', phase: 'queued',
      plainLanguage: 'Queued the requested GROVER change', internalDetail: JSON.stringify({ request: text }),
    });
  });
  return { featureId, runId };
}

export function addAcceptanceCheck(
  db: DatabaseSync,
  runId: string,
  suffix: string,
  title: string,
  description: string,
  checkType: string,
  requiredEvidenceTypes: string[],
): string {
  const run = db.prepare('SELECT feature_request_id FROM build_runs WHERE id = ?').get(runId) as
    { feature_request_id: string } | undefined;
  if (!run) throw new Error(`Unknown build run: ${runId}`);
  const id = `${runId}:${suffix}`;
  db.prepare(
    `INSERT OR IGNORE INTO acceptance_checks
      (id, feature_request_id, build_run_id, title, description, check_type,
       required_evidence_types, status, passes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 'system')`
  ).run(id, run.feature_request_id, runId, title, description, checkType, JSON.stringify(requiredEvidenceTypes));
  return id;
}

const FEATURE_STATUS: Record<string, string> = {
  queued: 'running', running: 'running', paused: 'blocked', blocked: 'blocked',
  verifying: 'verifying', passed: 'passed', failed: 'failed', cancelled: 'cancelled',
};

export function transitionRun(
  db: DatabaseSync,
  runId: string,
  status: string,
  phase: Phase,
  message: string,
  options: { actor?: Actor; detail?: string; costDelta?: number; sessionId?: string; failure?: string } = {},
): void {
  transaction(db, () => {
    const run = db.prepare('SELECT * FROM build_runs WHERE id = ?').get(runId) as Record<string, unknown> | undefined;
    if (!run) throw new Error(`Unknown build run: ${runId}`);
    const endedAt = ['passed', 'failed', 'cancelled'].includes(status) ? new Date().toISOString() : null;
    db.prepare(
      `UPDATE build_runs SET status = ?, current_phase = ?, ended_at = COALESCE(?, ended_at),
       engine_session_id = COALESCE(?, engine_session_id), failure_summary = COALESCE(?, failure_summary)
       WHERE id = ?`
    ).run(status, phase, endedAt, options.sessionId ?? null, options.failure ?? null, runId);
    db.prepare('UPDATE feature_requests SET status = ?, updated_at = ? WHERE id = ?')
      .run(FEATURE_STATUS[status] ?? status, new Date().toISOString(), run.feature_request_id);
    appendEventInTransaction(db, {
      scopeType: 'build_run', scopeId: runId, taskId: run.task_id as string, buildRunId: runId,
      idempotencyKey: `${runId}:${phase}:${randomUUID()}`, actor: options.actor ?? 'system', domain: 'builder',
      phase, plainLanguage: message, internalDetail: options.detail ?? '', costDelta: options.costDelta,
      modelRunId: options.sessionId,
    });
  });
}

export function appendTaskProgress(
  db: DatabaseSync,
  taskId: string,
  phase: Phase,
  message: string,
  detail = '',
  costDelta?: number,
  domain?: Context,
): void {
  appendEvent(db, {
    scopeType: 'task', scopeId: taskId, taskId,
    idempotencyKey: `${taskId}:${phase}:${randomUUID()}`, actor: 'grover', domain, phase,
    plainLanguage: message, internalDetail: detail, costDelta,
  });
}

export function checkBudget(db: DatabaseSync, estimatedMicroUsd: number): void {
  const kill = getSetting(db, 'kill_switch') === 'true';
  if (kill) throw new Error('The kill switch is on. No model work can start.');
  const budget = db.prepare("SELECT * FROM budgets WHERE id = 'development-phase'").get() as {
    hard_micro_usd: number; enabled: number;
  };
  const spent = db.prepare("SELECT COALESCE(SUM(amount_micro_usd), 0) AS total FROM cost_ledger WHERE kind = 'actual'")
    .get() as { total: number };
  if (budget.enabled && spent.total + estimatedMicroUsd > budget.hard_micro_usd) {
    throw new Error('This run would cross the development hard cap. Increase the budget before starting it.');
  }
}

export function recordCost(
  db: DatabaseSync,
  taskId: string,
  buildRunId: string | null,
  kind: 'estimate' | 'actual' | 'adjustment',
  amountMicroUsd: number,
  note: string,
  provider = 'anthropic',
  model = 'configured-default',
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO cost_ledger
      (id, task_id, build_run_id, kind, amount_micro_usd, provider, model, created_at, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, taskId, buildRunId, kind, amountMicroUsd, provider, model, new Date().toISOString(), note);
  if (buildRunId && kind === 'actual') {
    db.prepare('UPDATE build_runs SET actual_cost = actual_cost + ? WHERE id = ?').run(amountMicroUsd, buildRunId);
    db.prepare(
      'UPDATE feature_requests SET actual_cost = actual_cost + ? WHERE id = (SELECT feature_request_id FROM build_runs WHERE id = ?)'
    ).run(amountMicroUsd, buildRunId);
  }
  return id;
}

export function addEvidence(
  db: DatabaseSync,
  runId: string,
  checkId: string | null,
  type: string,
  origin: string,
  uri: string,
  summary: string,
  contentForHash = summary,
): string {
  const id = randomUUID();
  const hash = createHash('sha256').update(contentForHash).digest('hex');
  db.prepare(
    `INSERT INTO evidence_assets
      (id, build_run_id, acceptance_check_id, type, verifier_origin, trusted, uri_or_path, summary, created_at, hash)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
  ).run(id, runId, checkId, type, origin, uri, summary, new Date().toISOString(), hash);
  if (checkId) {
    const check = db.prepare('SELECT evidence_asset_ids FROM acceptance_checks WHERE id = ?').get(checkId) as { evidence_asset_ids: string };
    const ids = JSON.parse(check.evidence_asset_ids) as string[];
    ids.push(id);
    db.prepare("UPDATE acceptance_checks SET evidence_asset_ids = ?, status = 'passed', passes = 1 WHERE id = ?")
      .run(JSON.stringify(ids), checkId);
  }
  return id;
}

export function recordCommit(db: DatabaseSync, runId: string, hash: string, branch: string, message: string, diff: string): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO git_commits(id, build_run_id, hash, branch_name, message, diff_summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, runId, hash, branch, message, diff, new Date().toISOString());
  return id;
}

export function completeReceipt(db: DatabaseSync, runId: string, summary: string): string {
  const receiptId = addEvidence(db, runId, null, 'cost_receipt', 'cost_hook', `grover://receipts/${runId}`, summary);
  db.prepare('UPDATE build_runs SET receipt_id = ? WHERE id = ?').run(receiptId, runId);
  return receiptId;
}

export function closureReady(db: DatabaseSync, runId: string): boolean {
  const run = db.prepare('SELECT * FROM build_runs WHERE id = ?').get(runId) as { receipt_id: string | null; feature_request_id: string };
  const feature = db.prepare('SELECT signoff_state FROM feature_requests WHERE id = ?').get(run.feature_request_id) as { signoff_state: string };
  const open = db.prepare(
    'SELECT COUNT(*) AS count FROM acceptance_checks WHERE build_run_id = ? AND one_off = 0 AND (passes = 0 OR status != \'passed\')'
  ).get(runId) as { count: number };
  const passedChecks = db.prepare(
    'SELECT id, required_evidence_types FROM acceptance_checks WHERE build_run_id = ? AND passes = 1'
  ).all(runId) as { id: string; required_evidence_types: string }[];
  const evidenceComplete = passedChecks.every((check) => {
    const required = JSON.parse(check.required_evidence_types) as string[];
    const evidence = db.prepare(
      'SELECT type FROM evidence_assets WHERE acceptance_check_id = ? AND trusted = 1'
    ).all(check.id) as { type: string }[];
    const present = new Set(evidence.map((item) => item.type));
    return required.every((type) => present.has(type));
  });
  return Boolean(run.receipt_id) && open.count === 0 && evidenceComplete &&
    ['not_required', 'approved'].includes(feature.signoff_state);
}

export function saveMemory(db: DatabaseSync, content: string, namespace = 'will-private'): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO memories(id, namespace, content, provenance, created_at, updated_at)
     VALUES (?, ?, ?, 'will-direct', ?, ?)`
  ).run(id, namespace, content.trim(), now, now);
  return id;
}

export function deleteMemory(db: DatabaseSync, id: string): void {
  db.prepare('UPDATE memories SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), new Date().toISOString(), id);
}

export function getSetting(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, new Date().toISOString());
}

export function recordRoutingDecision(
  db: DatabaseSync,
  taskId: string,
  intent: Intent,
  selectedEngine: string,
  backupEngine: string | null,
  reason: string,
  userOverride: boolean,
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO routing_decisions
      (id, task_id, intent, selected_engine, backup_engine, reason, user_override, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, taskId, intent, selectedEngine, backupEngine, reason, userOverride ? 1 : 0, new Date().toISOString());
  return id;
}

export function completeRoutingDecision(db: DatabaseSync, id: string, outcome: string): void {
  db.prepare('UPDATE routing_decisions SET outcome = ?, completed_at = ? WHERE id = ?')
    .run(outcome, new Date().toISOString(), id);
}

export function rateTaskRouting(db: DatabaseSync, taskId: string, rating: 'positive' | 'negative', note = ''): void {
  db.prepare(
    `UPDATE routing_decisions SET rating = ?, feedback_note = ?
     WHERE id = (SELECT id FROM routing_decisions WHERE task_id = ? ORDER BY created_at DESC LIMIT 1)`
  ).run(rating, note, taskId);
}

export function engineRanking(db: DatabaseSync, intent: Intent): { id: string; score: number; samples: number }[] {
  const engines = db.prepare('SELECT id, priority FROM engine_registry WHERE enabled = 1 ORDER BY priority').all() as {
    id: string; priority: number;
  }[];
  const decisions = db.prepare(
    'SELECT selected_engine, outcome, rating FROM routing_decisions WHERE intent = ? AND outcome IS NOT NULL'
  ).all(intent) as { selected_engine: string; outcome: string; rating: string | null }[];
  return engines.map((engine) => {
    // Conservative priors preserve Will's Codex preference until real evidence accumulates.
    let wins = engine.id === 'codex-cli' ? 4 : 3;
    let losses = engine.id === 'codex-cli' ? 1 : 2;
    let samples = 0;
    for (const decision of decisions) {
      const actual = decision.outcome.startsWith('passed:') ? decision.outcome.slice(7) : decision.selected_engine;
      if (actual !== engine.id) continue;
      samples += 1;
      if (decision.outcome.startsWith('passed:')) wins += 1;
      else losses += 1;
      if (decision.rating === 'positive') wins += 2;
      if (decision.rating === 'negative') losses += 3;
    }
    return { id: engine.id, score: wins / (wins + losses), samples };
  }).sort((a, b) => b.score - a.score);
}

export function snapshot(db: DatabaseSync): Record<string, unknown> {
  const tasks = db.prepare(
    `SELECT t.*, e.internal_detail
     FROM task_state t JOIN events e ON e.seq = t.updated_seq
     ORDER BY t.updated_seq DESC LIMIT 100`
  ).all();
  const features = db.prepare(
    `SELECT f.*, b.status AS run_status, b.current_phase, b.branch_name, b.failure_summary,
            b.recovery_state, b.receipt_id, b.id AS build_run_id
     FROM feature_requests f LEFT JOIN build_runs b ON b.id = f.active_build_run_id
     ORDER BY f.updated_at DESC LIMIT 100`
  ).all();
  const events = db.prepare('SELECT * FROM events ORDER BY seq DESC LIMIT 200').all().reverse();
  const memories = db.prepare(
    `SELECT id, owner, namespace, category, confidence, sensitivity, importance, content, provenance,
            vault_path, created_at, updated_at
     FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL ORDER BY updated_at DESC`
  ).all();
  const memoryProposals = db.prepare(
    `SELECT id, namespace, proposed_operation, target_memory_id, status, provenance, sensitivity,
            rationale, proposed_content, created_at
     FROM memory_update_proposals WHERE status = 'proposed' ORDER BY created_at DESC`
  ).all();
  const memoryNamespaces = db.prepare('SELECT * FROM memory_namespaces ORDER BY id').all();
  const costs = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'actual' THEN amount_micro_usd ELSE 0 END), 0) AS actual,
            COALESCE(SUM(CASE WHEN kind = 'estimate' THEN amount_micro_usd ELSE 0 END), 0) AS estimated
     FROM cost_ledger`
  ).get();
  const budget = db.prepare("SELECT * FROM budgets WHERE id = 'development-phase'").get();
  const engines = db.prepare('SELECT * FROM engine_registry ORDER BY priority').all();
  const routing = db.prepare('SELECT * FROM routing_decisions ORDER BY created_at DESC LIMIT 50').all();
  const conversations = db.prepare(
    'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 200'
  ).all();
  const messages = db.prepare(
    `SELECT m.* FROM conversation_messages m
     JOIN conversations c ON c.id = m.conversation_id
     ORDER BY m.rowid`
  ).all();
  const contextRouting = db.prepare(
    'SELECT * FROM context_routing_decisions ORDER BY created_at DESC LIMIT 200'
  ).all();
  return {
    tasks, features, events, memories, memoryProposals, memoryNamespaces, costs, budget, engines, routing,
    contextRouting, conversations, messages, contexts: CONTEXTS,
    settings: {
      killSwitch: getSetting(db, 'kill_switch') === 'true',
      workspaceRoot: getSetting(db, 'workspace_root'),
      preferredEngine: getSetting(db, 'preferred_engine') ?? 'auto',
    },
  };
}

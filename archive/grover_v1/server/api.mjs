/**
 * REST + SSE API. Zero-dependency routing.
 * Every mutating action is audited (master prompt §5, layer 5).
 */
import { q, one, run, audit, getSettings, saveSettings } from './db.mjs';
import { setSecret, hasApiKey, maskedApiKey } from './config.mjs';
import {
  listMemories, createMemory, updateMemory, deleteMemory,
  vaultTree, readVaultFile, writeVaultFile, NAMESPACES, visibleNamespaces,
} from './memory.mjs';
import { listLedger, createLedgerItem, updateLedgerItem, setLedgerStatus, DOMAINS, CATEGORIES, STATUSES } from './ledger.mjs';
import { listSkills, patchSkill } from './skills.mjs';
import { chatTurn, workshopTurn, generateBrief, approveMemories } from './chat.mjs';
import {
  generateProposal, approveLoop, setLoopStatus, listLoops, loopForLedger, systemStatus,
  draftImprovement, decideImprovement, listLoopEvents, createDirectRun,
} from './loops.mjs';
import { runLoop, stopRun, isRunning } from './runner.mjs';
import { spend } from './router.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

const routes = [];
function route(method, pattern, handler) {
  const parts = pattern.split('/').filter(Boolean);
  routes.push({ method, parts, handler });
}

export async function handleApi(req, res, user, url) {
  const method = req.method;
  const pathParts = url.pathname.split('/').filter(Boolean);

  for (const r of routes) {
    if (r.method !== method || r.parts.length !== pathParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      else if (r.parts[i] !== pathParts[i]) { ok = false; break; }
    }
    if (!ok) continue;
    try {
      const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(req) : null;
      await r.handler({ req, res, user, url, params, body });
    } catch (err) {
      const status = err.code === 'forbidden' ? 403 : err.code === 'bad_request' ? 400 : 500;
      json(res, status, { error: err.message });
    }
    return true;
  }
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 2_000_000) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { code: 'bad_request' })); }
    });
    req.on('error', reject);
  });
}

export function json(res, status, obj) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function sseHead(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
  });
  return (obj) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* client gone */ }
  };
}

// ---- Bootstrap -----------------------------------------------------------------

route('GET', '/api/bootstrap', ({ res, user }) => {
  const settings = getSettings();
  json(res, 200, {
    user,
    users: q(`SELECT id, name, email FROM users`),
    settings,
    hasApiKey: hasApiKey(),
    maskedApiKey: maskedApiKey(),
    namespaces: visibleNamespaces(user.name),
    ledgerDomains: DOMAINS,
    ledgerCategories: CATEGORIES,
    ledgerStatuses: STATUSES,
    memoryNamespaces: NAMESPACES,
    counts: {
      memories: one(`SELECT COUNT(*) AS n FROM memories WHERE expired = 0`).n,
      ledgerPending: one(`SELECT COUNT(*) AS n FROM ledger WHERE status = 'pending_greenlight'`).n,
      conversations: one(`SELECT COUNT(*) AS n FROM conversations WHERE user_id = ?`, user.id).n,
    },
  });
});

route('GET', '/api/status', ({ res }) => {
  json(res, 200, systemStatus());
});

route('POST', '/api/user/select', ({ res, body, user }) => {
  const target = one(`SELECT id, name FROM users WHERE id = ?`, Number(body.userId));
  if (!target) return json(res, 400, { error: 'Unknown user' });
  audit(user.id, 'user_switch', `→ ${target.name}`);
  res.writeHead(200, {
    'content-type': 'application/json',
    'set-cookie': `grover_user=${target.id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`,
  });
  res.end(JSON.stringify({ ok: true, user: target }));
});

// ---- Settings --------------------------------------------------------------------

route('PUT', '/api/settings', ({ res, body, user }) => {
  const allowed = {};
  for (const k of ['theme', 'autonomyLevel', 'budgets', 'models', 'pricing', 'maxOutputTokens']) {
    if (body[k] !== undefined) allowed[k] = body[k];
  }
  const merged = saveSettings(allowed);
  audit(user.id, 'settings_update', Object.keys(allowed).join(', '));
  json(res, 200, { ok: true, settings: merged });
});

route('POST', '/api/settings/key', ({ res, body, user }) => {
  const key = (body.apiKey || '').trim();
  if (key && !key.startsWith('sk-ant-')) {
    return json(res, 400, { error: 'That doesn\'t look like an Anthropic API key (should start with sk-ant-).' });
  }
  setSecret('anthropicApiKey', key || null);
  audit(user.id, key ? 'api_key_set' : 'api_key_removed');
  json(res, 200, { ok: true, hasApiKey: hasApiKey(), maskedApiKey: maskedApiKey() });
});

// ---- Chat (SSE over POST) -----------------------------------------------------------

route('POST', '/api/chat', async ({ res, body, user }) => {
  const send = sseHead(res);
  try {
    await chatTurn({ user, body, send });
  } catch (err) {
    send({ type: 'error', code: err.code || 'internal', message: err.message });
  }
  res.end();
});

route('GET', '/api/conversations', ({ res, user }) => {
  json(res, 200, q(
    `SELECT c.id, c.title, c.mode, c.updated_at,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS messages
     FROM conversations c WHERE c.user_id = ? AND c.mode != 'workshop'
     ORDER BY c.updated_at DESC LIMIT 50`, user.id
  ));
});

route('GET', '/api/conversations/:id/messages', ({ res, user, params }) => {
  const conv = one(`SELECT user_id FROM conversations WHERE id = ?`, Number(params.id));
  if (!conv || conv.user_id !== user.id) return json(res, 403, { error: 'Not your conversation' });
  json(res, 200, q(
    `SELECT id, role, content, model, tier, cost, created_at
     FROM messages WHERE conversation_id = ? ORDER BY id`, Number(params.id)
  ));
});

// ---- Memory ---------------------------------------------------------------------------

route('GET', '/api/memory', ({ res, user, url }) => {
  json(res, 200, listMemories(user.name, {
    query: url.searchParams.get('query') || undefined,
    namespace: url.searchParams.get('namespace') || undefined,
  }));
});

route('POST', '/api/memory', ({ res, user, body }) => {
  const otherPrivate = user.name === 'Will' ? 'jackson-private' : 'will-private';
  if (body.namespace === otherPrivate) return json(res, 403, { error: 'Private namespaces don\'t cross users.' });
  const id = createMemory({ ...body, source: body.source || 'manual' });
  audit(user.id, 'memory_create', `#${id} [${body.namespace}]`);
  json(res, 200, { ok: true, id });
});

route('POST', '/api/memory/approve', ({ res, user, body }) => {
  const saved = approveMemories(user, body.candidates);
  json(res, 200, { ok: true, saved });
});

route('PUT', '/api/memory/:id', ({ res, user, params, body }) => {
  updateMemory(Number(params.id), body);
  audit(user.id, 'memory_update', `#${params.id}`);
  json(res, 200, { ok: true });
});

route('DELETE', '/api/memory/:id', ({ res, user, params }) => {
  deleteMemory(Number(params.id));
  audit(user.id, 'memory_delete', `#${params.id}`);
  json(res, 200, { ok: true });
});

// ---- Vault ------------------------------------------------------------------------------

route('GET', '/api/vault/tree', ({ res, user }) => {
  json(res, 200, vaultTree(user.name));
});

route('GET', '/api/vault/file', ({ res, user, url }) => {
  const rel = url.searchParams.get('path') || '';
  json(res, 200, { path: rel, content: readVaultFile(user.name, rel) });
});

route('PUT', '/api/vault/file', ({ res, user, body }) => {
  writeVaultFile(user.name, body.path, body.content ?? '');
  audit(user.id, 'vault_write', body.path);
  json(res, 200, { ok: true });
});

// ---- Ledger --------------------------------------------------------------------------------

route('GET', '/api/ledger', ({ res, url }) => {
  json(res, 200, listLedger({
    domain: url.searchParams.get('domain') || undefined,
    status: url.searchParams.get('status') || undefined,
  }));
});

route('POST', '/api/ledger', ({ res, user, body }) => {
  const id = createLedgerItem(body, user.name);
  audit(user.id, 'ledger_create', `#${id} ${body.item?.slice(0, 80)}`);
  json(res, 200, { ok: true, id });
});

route('PUT', '/api/ledger/:id', ({ res, user, params, body }) => {
  updateLedgerItem(Number(params.id), body);
  audit(user.id, 'ledger_update', `#${params.id}`);
  json(res, 200, { ok: true });
});

route('POST', '/api/ledger/:id/status', ({ res, user, params, body }) => {
  setLedgerStatus(Number(params.id), body.status, user.id, user.name);
  json(res, 200, { ok: true });
});

// ---- Direct execution (Path 1 — AGENT_POLICY.md) ----------------------------------------------
//
// Anything a human types runs immediately at effective L2: ledger item created
// approved (never pending_greenlight), loop created running (source 'direct'),
// handed straight to the runner. Progress streams as SSE. Budget gates apply
// inside the runner; without an API key the run blocks honestly.

route('POST', '/api/execute', async ({ res, user, body }) => {
  const request = String(body.request || '').trim();
  const itemId = body.itemId ? Number(body.itemId) : null;
  if (!request && !itemId) return json(res, 400, { error: 'Provide request text or an itemId.' });
  if (itemId) {
    const existing = loopForLedger(itemId);
    if (existing && isRunning(existing.id)) {
      return json(res, 400, { error: `Loop #${existing.id} is already running.` });
    }
  }
  const send = sseHead(res);
  try {
    const { item, loop } = createDirectRun({ user, request: request || undefined, itemId });
    send({ type: 'loop', loopId: loop.id, ledgerId: item.id, goal: loop.goal });
    audit(user.id, 'direct_execute', `loop #${loop.id} ← ledger #${item.id}: ${(request || item.item).slice(0, 120)}`);
    const result = await runLoop({
      user, loop, item,
      tier: body.tier, force: Boolean(body.force), send,
    });
    send({ type: 'done', status: result.status, reason: result.reason || undefined });
  } catch (err) {
    send({ type: 'error', code: err.code || 'internal', message: err.message });
  }
  res.end();
});

route('POST', '/api/loops/:id/stop', ({ res, user, params }) => {
  const id = Number(params.id);
  const wasRunning = stopRun(id);
  audit(user.id, 'loop_stop', `loop #${id}${wasRunning ? '' : ' (runner not active)'}`);
  json(res, 200, { ok: true, wasRunning });
});

// ---- Greenlight Build Loop (docs/LOOP_ENGINEERING.md) -----------------------------------------

route('POST', '/api/ledger/:id/proposal', async ({ res, user, params }) => {
  const item = one(`SELECT * FROM ledger WHERE id = ?`, Number(params.id));
  if (!item) return json(res, 404, { error: 'No such ledger item' });
  const existing = loopForLedger(item.id);
  if (existing) return json(res, 200, { alreadyLooped: true, loop: existing });
  json(res, 200, await generateProposal({ user, item }));
});

route('POST', '/api/ledger/:id/approve', ({ res, user, params, body }) => {
  const item = one(`SELECT * FROM ledger WHERE id = ?`, Number(params.id));
  if (!item) return json(res, 404, { error: 'No such ledger item' });
  if (!body.proposal || !body.proposal.goal) return json(res, 400, { error: 'Missing proposal' });
  const loop = approveLoop({ user, item, proposal: body.proposal, offline: Boolean(body.offline) });
  json(res, 200, { ok: true, loop });
});

route('GET', '/api/loops', ({ res, url }) => {
  json(res, 200, listLoops({ active: url.searchParams.get('active') === '1' }));
});

route('GET', '/api/loops/:id/events', ({ res, params }) => {
  json(res, 200, listLoopEvents(Number(params.id)));
});

route('POST', '/api/loops/:id/status', ({ res, user, params, body }) => {
  const loop = setLoopStatus({
    user, loopId: Number(params.id),
    status: body.status, summary: body.summary, reason: body.reason,
    manualEvidence: body.manual_evidence,
  });
  json(res, 200, { ok: true, loop });
});

// ---- Improvement Requests (Path 2 — Grover-initiated; docs/LOOP_ENGINEERING.md) --------
//
// These endpoints remain for improvements Grover surfaces unprompted:
// propose → pending_greenlight → human approval → queued loop.
// Human-typed requests do NOT come through here anymore — they hit
// /api/execute (Path 1) and run immediately.

route('POST', '/api/improvements/propose', async ({ res, user, body }) => {
  const request = String(body.request || '').trim();
  if (!request) return json(res, 400, { error: 'Describe the improvement first.' });
  json(res, 200, await draftImprovement({ user, request: request.slice(0, 2000) }));
});

route('POST', '/api/improvements', ({ res, user, body }) => {
  const decision = body.decision;
  if (!['approve', 'save', 'reject'].includes(decision)) {
    return json(res, 400, { error: 'decision must be approve, save, or reject' });
  }
  const request = String(body.request || '').trim();
  if (!request) return json(res, 400, { error: 'Missing original request text' });
  if (decision !== 'reject') {
    if (!body.draft?.title || !body.proposal?.goal || !Array.isArray(body.proposal?.steps)) {
      return json(res, 400, { error: 'Missing draft/proposal' });
    }
  }
  json(res, 200, decideImprovement({
    user, request,
    draft: body.draft, proposal: body.proposal,
    offline: Boolean(body.offline), decision,
  }));
});

// ---- Docs (read-only; Builder links its own engineering docs) ----------------------

const DOCS_DIR = join(ROOT, 'docs');
const docsList = () => readdirSync(DOCS_DIR).filter((f) => /^[\w-]+\.md$/.test(f));

route('GET', '/api/docs', ({ res }) => {
  json(res, 200, docsList());
});

route('GET', '/api/docs/:name', ({ res, params }) => {
  if (!docsList().includes(params.name)) return json(res, 404, { error: 'No such doc' });
  json(res, 200, { name: params.name, content: readFileSync(join(DOCS_DIR, params.name), 'utf8') });
});

route('POST', '/api/ledger/:id/brief', async ({ res, user, params }) => {
  const item = one(`SELECT * FROM ledger WHERE id = ?`, Number(params.id));
  if (!item) return json(res, 404, { error: 'No such ledger item' });
  try {
    const result = await generateBrief({ user, item });
    json(res, 200, { ok: true, ...result });
  } catch (err) {
    json(res, err.code === 'no_key' ? 400 : 500, { error: err.message });
  }
});

route('POST', '/api/ledger/:id/chat', async ({ res, user, params, body }) => {
  const item = one(`SELECT * FROM ledger WHERE id = ?`, Number(params.id));
  if (!item) return json(res, 404, { error: 'No such ledger item' });
  const send = sseHead(res);
  try {
    if (!body.message || !String(body.message).trim()) {
      send({ type: 'error', code: 'bad_request', message: 'Empty message.' });
    } else {
      await workshopTurn({ user, item, body, send });
    }
  } catch (err) {
    send({ type: 'error', code: err.code || 'internal', message: err.message });
  }
  res.end();
});

route('GET', '/api/ledger/:id/messages', ({ res, params }) => {
  const item = one(`SELECT conversation_id FROM ledger WHERE id = ?`, Number(params.id));
  if (!item || !item.conversation_id) return json(res, 200, []);
  json(res, 200, q(
    `SELECT id, role, content, tier, cost, created_at FROM messages
     WHERE conversation_id = ? ORDER BY id`, item.conversation_id
  ));
});

// ---- Skills ----------------------------------------------------------------------------------

route('GET', '/api/skills', ({ res }) => json(res, 200, listSkills()));

route('POST', '/api/skills', ({ res, user, body }) => {
  const id = patchSkill(Number(body.id), body);
  audit(user.id, 'skill_save', body.name || `#${body.id}`);
  json(res, 200, { ok: true, id });
});

// ---- Costs / observability (§11.8) --------------------------------------------------------------

route('GET', '/api/costs/summary', ({ res }) => {
  const byModel = q(
    `SELECT model, tier, COUNT(*) AS calls, SUM(cost) AS cost,
            SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
            SUM(cache_read_tokens) AS cache_read_tokens
     FROM model_calls WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
     GROUP BY model, tier ORDER BY cost DESC`
  );
  const byTask = q(
    `SELECT task_type, COUNT(*) AS calls, SUM(cost) AS cost
     FROM model_calls WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
     GROUP BY task_type ORDER BY cost DESC`
  );
  const byUser = q(
    `SELECT COALESCE(u.name, 'system') AS name, COUNT(*) AS calls, SUM(c.cost) AS cost
     FROM model_calls c LEFT JOIN users u ON u.id = c.user_id
     WHERE strftime('%Y-%m', c.created_at) = strftime('%Y-%m', 'now')
     GROUP BY u.name ORDER BY cost DESC`
  );
  const totals = one(
    `SELECT COUNT(*) AS calls,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(SUM(cache_read_tokens), 0) AS cache_read,
            COALESCE(SUM(CASE WHEN error IS NOT NULL THEN cost ELSE 0 END), 0) AS failed_cost
     FROM model_calls WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`
  );
  json(res, 200, {
    spend: { today: spend('day'), week: spend('week'), month: spend('month') },
    budgets: getSettings().budgets,
    byModel, byTask, byUser, totals,
  });
});

route('GET', '/api/costs/calls', ({ res }) => {
  json(res, 200, q(
    `SELECT c.*, u.name AS user_name FROM model_calls c
     LEFT JOIN users u ON u.id = c.user_id
     ORDER BY c.id DESC LIMIT 100`
  ));
});

// ---- Audit ------------------------------------------------------------------------------------------

route('GET', '/api/audit', ({ res }) => {
  json(res, 200, q(
    `SELECT a.*, u.name AS user_name FROM audit a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC LIMIT 200`
  ));
});

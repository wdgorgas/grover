/**
 * Chat orchestration — one turn, end to end (master prompt §11.1 lifecycle):
 *
 *   classify → build context → route tier → budget gate → stream → log cost
 *
 * Three entry points share runTurn():
 *   chatTurn()      Command Center + Desks (skill via body.skillId)
 *   workshopTurn()  per-ledger-item discussion (item context + auto skill)
 *   generateBrief() implementation brief for a ledger item
 */
import { one, run, q, audit } from './db.mjs';
import { buildContext, createMemory, NAMESPACES } from './memory.mjs';
import { getSkill, getSkillByName } from './skills.mjs';
import {
  routeTier, modelForTier, maxTokensForTier,
  estimateTokens, estimateCost, computeCost, checkBudget,
} from './router.mjs';
import { streamMessage, completeMessage, systemBlocks } from './anthropic.mjs';

const HISTORY_TURNS = 12;

function logCall({ userId, conversationId, taskType, model, tier, usage, cost, latencyMs, escalated, error }) {
  run(
    `INSERT INTO model_calls(user_id, conversation_id, task_type, model, tier,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
       cost, latency_ms, escalated, error)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId ?? null, conversationId ?? null, taskType, model, tier,
    usage?.input_tokens || 0, usage?.output_tokens || 0,
    usage?.cache_read_input_tokens || 0, usage?.cache_creation_input_tokens || 0,
    cost || 0, latencyMs ?? null, escalated ? 1 : 0, error || null
  );
}

/** The shared turn engine. Returns assistant text, or null on gate/error. */
async function runTurn({ user, conversationId, message, requestedTier, taskType, mode, skillPrompt, extraSystem, force, send }) {
  run(`INSERT INTO messages(conversation_id, role, content) VALUES(?, 'user', ?)`, conversationId, message);
  run(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`, conversationId);

  send({ type: 'state', state: 'retrieving_memory' });
  const ctx = buildContext(user, message, { skillPrompt });
  const dynamic = ctx.dynamic + (extraSystem ? `\n\n${extraSystem}` : '');

  const history = q(
    `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`,
    conversationId, HISTORY_TURNS
  ).reverse().map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const tier = mode === 'brain_dump' && !requestedTier
    ? 'fast'
    : routeTier({ taskType, requestedTier });
  const model = modelForTier(tier);
  const maxTokens = maxTokensForTier(tier);

  const inputEstimate = estimateTokens(ctx.stable + dynamic + JSON.stringify(history));
  const estCost = estimateCost(tier, inputEstimate, maxTokens);
  const budget = checkBudget(estCost);
  if (!budget.ok && !force) {
    send({
      type: 'approval_required',
      reason: budget.reason,
      spentToday: round4(budget.spentToday),
      spentMonth: round4(budget.spentMonth),
      caps: budget.caps,
      estimatedCost: round4(estCost),
    });
    audit(user.id, 'budget_gate', `${budget.reason}; est $${round4(estCost)}`);
    return null;
  }
  if (!budget.ok && force) {
    audit(user.id, 'budget_override', `${budget.reason} overridden by ${user.name}`);
  }

  send({
    type: 'meta',
    tier, model, mode: mode || 'chat',
    memoriesInjected: ctx.injected,
    estimatedCost: round4(estCost),
  });
  send({ type: 'state', state: tier === 'frontier' || tier === 'fable' ? 'frontier' : 'thinking' });

  const started = Date.now();
  let result;
  try {
    result = await streamMessage({
      model,
      system: systemBlocks(ctx.stable, dynamic),
      messages: history,
      maxTokens,
      onDelta: (text) => send({ type: 'delta', text }),
    });
  } catch (err) {
    logCall({
      userId: user.id, conversationId, taskType, model, tier,
      usage: null, cost: 0, latencyMs: Date.now() - started, error: err.code || err.message,
    });
    send({ type: 'error', code: err.code || 'api_error', message: err.message });
    return null;
  }

  const latencyMs = Date.now() - started;
  const cost = computeCost(tier, result.usage);
  logCall({ userId: user.id, conversationId, taskType, model, tier, usage: result.usage, cost, latencyMs });
  run(
    `INSERT INTO messages(conversation_id, role, content, model, tier, cost) VALUES(?, 'assistant', ?, ?, ?, ?)`,
    conversationId, result.text, model, tier, cost
  );
  send({
    type: 'done',
    cost: round4(cost),
    usage: result.usage,
    latencyMs,
    spentToday: round4(checkBudget(0).spentToday),
  });
  return result.text;
}

// ---- Command Center / Desks ---------------------------------------------------

export async function chatTurn({ user, body, send }) {
  const { message, tier: requestedTier, mode = 'chat', skillId, force = false } = body;
  let { conversationId } = body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    send({ type: 'error', code: 'bad_request', message: 'Empty message.' });
    return;
  }
  if (conversationId) {
    const conv = one(`SELECT user_id FROM conversations WHERE id = ?`, conversationId);
    if (!conv || conv.user_id !== user.id) conversationId = null;
  }
  if (!conversationId) {
    const res = run(`INSERT INTO conversations(user_id, mode) VALUES(?, ?)`, user.id, mode);
    conversationId = Number(res.lastInsertRowid);
  }
  send({ type: 'conversation', conversationId });

  const skill = skillId ? getSkill(Number(skillId)) : null;
  let skillPrompt = skill?.prompt || null;
  if (mode === 'brain_dump') {
    // Memory Curator is auto-applied — a background operator, not a dropdown choice.
    const curator = getSkillByName('Memory Curator');
    skillPrompt = (curator?.prompt || '') + `\n\nBrain Dump mode is active. ${user.name} is thinking out loud. Your job:
listen, reflect the key points back briefly, and ask at most ONE sharp follow-up question
that would make the dump more useful as memory. Do not lecture. A separate extraction pass
will identify durable memories for approval.`;
  }

  const text = await runTurn({
    user, conversationId, message, requestedTier,
    taskType: mode, mode, skillPrompt, force, send,
  });
  if (text === null) return;

  if (mode === 'brain_dump') {
    await extractMemoryCandidates({ user, conversationId, message, send });
  }
  await maybeTitleConversation({ user, conversationId });
}

// ---- Ledger workshop ------------------------------------------------------------

function ledgerContext(item) {
  return `# WORKSHOP CONTEXT — Deferred Action Ledger item #${item.id}
You are workshopping ONE specific ledger item with the user. Stay on this item.
item: ${item.item}
domain: ${item.domain} | category: ${item.category} | severity: ${item.severity}
status: ${item.status} | detected by: ${item.detected_by}
notes: ${item.notes || '(none)'}
${item.brief ? `\nCurrent implementation brief:\n${item.brief}` : ''}
Reality check you must respect: greenlighting an item in Grover records approval — nothing
executes automatically yet. Work happens when the user acts on it (or, later, when a coding
loop is run against it). Help the user sharpen scope, plan, risks, and next concrete steps.
If the plan changes materially, offer a one-line summary they can paste into the item's notes.`;
}

export async function workshopTurn({ user, item, body, send }) {
  let conversationId = item.conversation_id;
  if (conversationId) {
    const conv = one(`SELECT id FROM conversations WHERE id = ?`, conversationId);
    if (!conv) conversationId = null;
  }
  if (!conversationId) {
    const res = run(
      `INSERT INTO conversations(user_id, mode, title) VALUES(?, 'workshop', ?)`,
      user.id, `Workshop: ${item.item.slice(0, 48)}`
    );
    conversationId = Number(res.lastInsertRowid);
    run(`UPDATE ledger SET conversation_id = ? WHERE id = ?`, conversationId, item.id);
  }
  send({ type: 'conversation', conversationId });

  // grover-dev items get the Grover Architect automatically.
  const skillPrompt = item.domain === 'grover-dev'
    ? (getSkillByName('Grover Architect')?.prompt || null)
    : null;

  await runTurn({
    user, conversationId,
    message: body.message,
    requestedTier: body.tier,
    taskType: 'workshop', mode: 'workshop',
    skillPrompt,
    extraSystem: ledgerContext(item),
    force: body.force,
    send,
  });
}

/** Smart-tier implementation brief for a ledger item (Output Class 5). */
export async function generateBrief({ user, item }) {
  const model = modelForTier('smart');
  const started = Date.now();
  const skillPrompt = item.domain === 'grover-dev' ? getSkillByName('Grover Architect')?.prompt : null;
  const { text, usage } = await completeMessage({
    model,
    system: [{
      type: 'text',
      text: `${skillPrompt || 'You are Grover, a pragmatic technical planner.'}

Write a compact implementation brief for one Deferred Action Ledger item. Format (markdown):
**Goal** — one sentence. **Why it matters** — one sentence. **Plan** — 3-6 numbered concrete
steps. **Touches** — files/systems/people affected. **Effort** — rough hours. **Risks** — the
1-2 realest ones. **Definition of done** — how we'll know. No preamble, no filler. Note:
approval in Grover records a greenlight; nothing auto-executes — write steps for a human
(or a future coding loop) to act on.`,
    }],
    messages: [{
      role: 'user',
      content: `Item #${item.id}: ${item.item}\ndomain: ${item.domain} | category: ${item.category} | severity: ${item.severity}\nnotes: ${item.notes || '(none)'}`,
    }],
    maxTokens: 900,
  });
  const cost = computeCost('smart', usage);
  logCall({
    userId: user.id, conversationId: item.conversation_id, taskType: 'ledger_brief',
    model, tier: 'smart', usage, cost, latencyMs: Date.now() - started,
  });
  run(`UPDATE ledger SET brief = ?, updated_at = datetime('now') WHERE id = ?`, text, item.id);
  audit(user.id, 'ledger_brief', `#${item.id}`);
  return { brief: text, cost: round4(cost) };
}

// ---- Post-turn plumbing (fast tier) ------------------------------------------------

async function extractMemoryCandidates({ user, conversationId, message, send }) {
  send({ type: 'state', state: 'memory' });
  const model = modelForTier('fast');
  const started = Date.now();
  const defaultNs = user.name === 'Jackson' ? 'jackson-private' : 'will-private';
  try {
    const { text, usage } = await completeMessage({
      model,
      system: [{
        type: 'text',
        text: `Extract durable memories from a brain dump by ${user.name}. Output ONLY a JSON array, no prose.
Each element: {"content": string (a single self-contained fact/preference/goal/decision),
"namespace": one of ${JSON.stringify(NAMESPACES)},
"category": short lowercase word, "confidence": "high"|"medium"|"low", "importance": 1-5}.
Rules: private-by-default (${defaultNs}) unless clearly business (shared/business),
Grover development (shared/grover-dev), or home/media tech (shared/home-tech).
Durable facts only — no ephemeral chatter. 0 to 6 items. Empty array if nothing durable.`,
      }],
      messages: [{ role: 'user', content: message }],
      maxTokens: 700,
    });
    const cost = computeCost('fast', usage);
    logCall({
      userId: user.id, conversationId, taskType: 'brain_dump_extract',
      model, tier: 'fast', usage, cost, latencyMs: Date.now() - started,
    });
    const candidates = salvageJsonArray(text)
      .filter((c) => c && typeof c.content === 'string' && NAMESPACES.includes(c.namespace))
      .slice(0, 6);
    if (candidates.length) send({ type: 'memory_candidates', candidates });
  } catch (err) {
    logCall({
      userId: user.id, conversationId, taskType: 'brain_dump_extract',
      model, tier: 'fast', usage: null, cost: 0,
      latencyMs: Date.now() - started, error: err.code || err.message,
    });
  }
}

async function maybeTitleConversation({ user, conversationId }) {
  const conv = one(`SELECT title FROM conversations WHERE id = ?`, conversationId);
  if (!conv || conv.title !== 'New conversation') return;
  const msgs = q(`SELECT role, content FROM messages WHERE conversation_id = ? LIMIT 2`, conversationId);
  if (msgs.length < 2) return;
  const model = modelForTier('fast');
  const started = Date.now();
  try {
    const { text, usage } = await completeMessage({
      model,
      system: [{ type: 'text', text: 'Reply with a 2-5 word title for this conversation. Title only, no quotes, no punctuation at the end.' }],
      messages: [{ role: 'user', content: msgs.map((m) => `${m.role}: ${m.content.slice(0, 400)}`).join('\n') }],
      maxTokens: 24,
    });
    const cost = computeCost('fast', usage);
    logCall({ userId: user.id, conversationId, taskType: 'title', model, tier: 'fast', usage, cost, latencyMs: Date.now() - started });
    const title = text.trim().slice(0, 60);
    if (title) run(`UPDATE conversations SET title = ? WHERE id = ?`, title, conversationId);
  } catch { /* titles are decoration */ }
}

// ---- Brain-dump approval -------------------------------------------------------------

export function approveMemories(user, candidates) {
  const saved = [];
  for (const c of (candidates || []).slice(0, 12)) {
    if (!c || typeof c.content !== 'string' || !NAMESPACES.includes(c.namespace)) continue;
    const otherPrivate = user.name === 'Will' ? 'jackson-private' : 'will-private';
    if (c.namespace === otherPrivate) continue;
    const id = createMemory({
      namespace: c.namespace,
      category: c.category || 'general',
      content: c.content.slice(0, 2000),
      confidence: ['high', 'medium', 'low'].includes(c.confidence) ? c.confidence : 'medium',
      importance: Math.min(5, Math.max(1, Number(c.importance) || 3)),
      source: 'brain_dump',
    });
    saved.push(id);
  }
  audit(user.id, 'memories_approved', `${saved.length} saved`);
  return saved;
}

function salvageJsonArray(text) {
  try { return JSON.parse(text); } catch { /* try harder */ }
  const m = text.match(/\[[\s\S]*\]/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* give up */ } }
  return [];
}

function round4(n) {
  return Math.round((n || 0) * 10000) / 10000;
}

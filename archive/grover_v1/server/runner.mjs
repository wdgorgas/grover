/**
 * Loop runner v0 — GROVER's first real execution surface.
 *
 * An agentic tool-use loop over the Anthropic Messages API: the model works
 * a loop's goal against the repo with four tools (read_file, write_file,
 * list_dir, run_verify), hard-confined to the repo root, with writes to
 * data/, vault/, .git/ and secrets denied outright.
 *
 * Honesty contract:
 *  - No API key → the run is immediately blocked with a plain reason.
 *    Nothing is simulated, ever.
 *  - Every model call passes the Cost Governor (checkBudget) and is logged
 *    to model_calls (task_type 'runner'). Every tool action lands in
 *    loop_events (event 'exec').
 *  - Evidence or it didn't happen: every file written is captured (path,
 *    byte delta, line diff) plus the final verify output, stored as JSON in
 *    loops.execution_evidence. Verify passes + ≥1 file changed → the loop
 *    moves to 'verifying' for human review. Anything else → 'blocked' with
 *    the real reason.
 *  - Abort: POST /api/loops/:id/stop flips an in-memory flag the runner
 *    checks before every model call and every tool execution.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, join, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, hasApiKey } from './config.mjs';
import { run, audit } from './db.mjs';
import { completeWithTools } from './anthropic.mjs';
import { modelForTier, computeCost, checkBudget, estimateTokens, estimateCost, TIERS } from './router.mjs';
import { getSkillByName } from './skills.mjs';
import { setLoopStatus, loopEvent } from './loops.mjs';

const MAX_ITERATIONS = 20;       // hard cap on model calls per run
const MAX_READ_CHARS = 48_000;   // per read_file response
const MAX_TAIL_CHARS = 4_000;    // verify output tail kept as evidence
const MAX_DIFF_LINES = 200;      // per-file diff truncation
const RUNNER_MAX_TOKENS = 8192;  // whole files come back as output tokens
const VERIFY_TIMEOUT_MS = 240_000;

// ---- Abort registry (in-memory; a crashed server forgets, honestly) ----------

const RUNNING = new Map(); // loopId -> { abort: boolean }

export function stopRun(loopId) {
  const r = RUNNING.get(Number(loopId));
  if (!r) return false;
  r.abort = true;
  return true;
}
export function isRunning(loopId) {
  return RUNNING.has(Number(loopId));
}

// ---- Path confinement ---------------------------------------------------------

const DENY_WRITE_TOPS = ['data', 'vault', '.git', 'node_modules'];
const DENY_READ_TOPS = ['data', '.git', 'node_modules'];

function resolveRepoPath(p) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('Missing path');
  const abs = resolve(ROOT, p);
  const rel = relative(ROOT, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Path escapes the repo: ${p}`);
  return { abs, rel: rel.split('\\').join('/') };
}
function topDir(rel) {
  return rel.split('/')[0] || '';
}
function assertWritable(rel) {
  if (DENY_WRITE_TOPS.includes(topDir(rel))) throw new Error(`Writes to ${topDir(rel)}/ are denied`);
  if (/secret/i.test(rel)) throw new Error('Writes to secrets are denied');
}
function assertReadable(rel) {
  if (DENY_READ_TOPS.includes(topDir(rel))) throw new Error(`Reads from ${topDir(rel)}/ are denied`);
  if (/secret/i.test(rel)) throw new Error('Reads of secrets are denied');
}

// ---- Evidence helpers ----------------------------------------------------------

/** Unified-ish diff by common prefix/suffix line comparison, truncated. */
function simpleDiff(before, after) {
  const a = (before ?? '').split('\n');
  const b = (after ?? '').split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const lines = [
    `@@ -${start + 1},${endA - start} +${start + 1},${endB - start} @@`,
    ...a.slice(start, endA).map((l) => `- ${l}`),
    ...b.slice(start, endB).map((l) => `+ ${l}`),
  ];
  if (lines.length > MAX_DIFF_LINES) {
    return [...lines.slice(0, MAX_DIFF_LINES), `… diff truncated (${lines.length - MAX_DIFF_LINES} more lines)`].join('\n');
  }
  return lines.join('\n');
}

function runVerify() {
  return new Promise((resolveP) => {
    const child = spawn(
      process.execPath,
      [join(ROOT, 'scripts', 'verify.mjs'), '--server-only'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    const cap = (d) => { out += String(d); if (out.length > 200_000) out = out.slice(-100_000); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } out += '\n[verify timed out]'; }, VERIFY_TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveP({ exit_code: code ?? 1, passed: code === 0, tail: out.slice(-MAX_TAIL_CHARS) });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolveP({ exit_code: 1, passed: false, tail: `verify spawn failed: ${err.message}` });
    });
  });
}

// ---- Tools ------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file inside the GROVER repo. Path is repo-relative. Large files are truncated.',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Repo-relative path' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a UTF-8 text file inside the repo. Writes to data/, vault/, .git/ or secrets are denied. Always write the COMPLETE file content.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  },
  {
    name: 'list_dir',
    description: 'List a directory inside the repo (defaults to the repo root).',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
  },
  {
    name: 'run_verify',
    description: 'Run the project verification battery (node scripts/verify.mjs --server-only). Returns exit code and output tail. Run this after your changes; a run cannot succeed without a passing verify.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

async function execTool(name, input, ctx) {
  try {
    switch (name) {
      case 'read_file': {
        const { abs, rel } = resolveRepoPath(input.path);
        assertReadable(rel);
        if (!existsSync(abs)) return { content: `No such file: ${rel}`, isError: true, note: `read ${rel} (missing)` };
        let text = readFileSync(abs, 'utf8');
        if (text.length > MAX_READ_CHARS) text = text.slice(0, MAX_READ_CHARS) + `\n… truncated at ${MAX_READ_CHARS} chars`;
        return { content: text, note: `read ${rel}` };
      }
      case 'write_file': {
        const { abs, rel } = resolveRepoPath(input.path);
        assertWritable(rel);
        if (typeof input.content !== 'string') throw new Error('write_file needs string content');
        const before = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, input.content, 'utf8');
        const entry = ctx.files.get(rel) || { before, beforeBytes: before === null ? 0 : Buffer.byteLength(before) };
        entry.after = input.content;
        entry.afterBytes = Buffer.byteLength(input.content);
        entry.created = entry.created ?? (before === null);
        ctx.files.set(rel, entry);
        ctx.writeSeq++;
        return { content: `Wrote ${rel} (${entry.afterBytes} bytes)`, note: `wrote ${rel} (${entry.afterBytes} bytes${entry.created ? ', new file' : ''})` };
      }
      case 'list_dir': {
        const { abs, rel } = resolveRepoPath(input.path || '.');
        if (rel) assertReadable(rel);
        const entries = readdirSync(abs, { withFileTypes: true })
          .filter((e) => !DENY_READ_TOPS.includes(e.name) || rel)
          .slice(0, 200)
          .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
        return { content: entries.join('\n') || '(empty)', note: `listed ${rel || '.'}` };
      }
      case 'run_verify': {
        const v = await runVerify();
        ctx.lastVerify = { ...v, afterWrites: ctx.writeSeq };
        return {
          content: `exit code ${v.exit_code} (${v.passed ? 'PASS' : 'FAIL'})\n${v.tail}`,
          isError: !v.passed,
          note: `run_verify → exit ${v.exit_code} (${v.passed ? 'pass' : 'fail'})`,
        };
      }
      default:
        return { content: `Unknown tool: ${name}`, isError: true, note: `unknown tool ${name}` };
    }
  } catch (err) {
    return { content: `Error: ${err.message}`, isError: true, note: `${name} denied/failed: ${err.message.slice(0, 120)}` };
  }
}

// ---- Prompts ------------------------------------------------------------------------

const RUNNER_SYSTEM = `You are Grover's loop runner v0 — a careful, honest coding agent operating on the GROVER
codebase itself (a zero-dependency Node 22 + vanilla-JS self-hosted AI command center). You have four tools:
read_file, write_file, list_dir, run_verify. You have at most ${MAX_ITERATIONS} model iterations — budget them.
Read before you write; write complete files; never fabricate results or claim unverified success.`;

function taskPrompt(loop, item) {
  const parts = [
    'Work this task in the GROVER repository. All paths are repo-relative.',
    '',
    `TASK: ${loop.goal}`,
  ];
  if (item?.notes) parts.push(`NOTES: ${item.notes.slice(0, 1000)}`);
  if (loop.steps?.length) parts.push(`PLANNED STEPS:\n${loop.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  if (loop.scope?.length) parts.push(`SCOPE: ${loop.scope.join('; ')}`);
  if (item?.brief) parts.push(`BRIEF:\n${item.brief.slice(0, 1500)}`);
  parts.push('', `Rules:
- Zero runtime dependencies (Node 22 built-ins only). No npm installs, no new packages.
- Make the smallest correct change. Match the existing code style.
- Writes to data/, vault/, .git/ or any secrets file are denied and will fail.
- When your changes are complete, call run_verify. If it fails, fix the problem and re-run it.
- Finish with a short plain-text summary of what changed. Be honest about anything left undone.`);
  return parts.join('\n');
}

// ---- The run -------------------------------------------------------------------------

function logRunnerCall({ userId, model, tier, usage, cost, latencyMs, error }) {
  run(
    `INSERT INTO model_calls(user_id, task_type, model, tier, input_tokens, output_tokens,
       cache_read_tokens, cache_write_tokens, cost, latency_ms, error)
     VALUES(?, 'runner', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId ?? null, model, tier,
    usage?.input_tokens || 0, usage?.output_tokens || 0,
    usage?.cache_read_input_tokens || 0, usage?.cache_creation_input_tokens || 0,
    cost || 0, latencyMs ?? null, error || null
  );
}

const round4 = (n) => Math.round((n || 0) * 10000) / 10000;

/**
 * Execute a loop (already in status 'running') against the repo.
 * Returns { status, reason } — the loop's final state, also persisted.
 */
export async function runLoop({ user, loop, item, tier, force = false, send = () => {} }) {
  const loopId = loop.id;
  if (RUNNING.has(loopId)) {
    throw Object.assign(new Error('This loop is already being run.'), { code: 'bad_request' });
  }
  if (!TIERS.includes(tier)) tier = 'smart';
  const flag = { abort: false };
  RUNNING.set(loopId, flag);

  const ctx = { files: new Map(), writeSeq: 0, lastVerify: null, calls: 0, cost: 0 };

  const attachEvidence = (extra = {}) => {
    if (ctx.files.size === 0 && !extra.force_attach) return false;
    const evidence = {
      files: [...ctx.files.entries()].map(([rel, f]) => ({
        path: rel,
        created: Boolean(f.created),
        bytes_before: f.beforeBytes,
        bytes_after: f.afterBytes,
        delta: f.afterBytes - f.beforeBytes,
        diff: simpleDiff(f.before, f.after),
      })),
      verify: ctx.finalVerify || null,
      model_calls: ctx.calls,
      cost: round4(ctx.cost),
      tier,
      ...extra,
    };
    delete evidence.force_attach;
    run(`UPDATE loops SET execution_evidence = ?, updated_at = datetime('now') WHERE id = ?`,
      JSON.stringify(evidence), loopId);
    return true;
  };

  const finish = (status, reason, summary) => {
    const updated = setLoopStatus({ user, loopId, status, reason, summary });
    send({ type: 'runner', state: 'finished', status, reason: reason || undefined });
    return { status, reason: reason || null, loop: updated };
  };

  try {
    send({ type: 'runner', state: 'starting', loopId, tier });
    if (!hasApiKey()) {
      audit(user.id, 'runner_blocked', `loop #${loopId}: no API key`);
      return finish('blocked', 'no API key — runner needs one');
    }

    const model = modelForTier(tier);
    const architect = getSkillByName('Grover Architect')?.prompt;
    const system = [{ type: 'text', text: `${architect ? architect + '\n\n' : ''}${RUNNER_SYSTEM}` }];
    const messages = [{ role: 'user', content: taskPrompt(loop, item) }];
    let finalText = '';
    let limitReason = null;

    for (let i = 1; i <= MAX_ITERATIONS; i++) {
      if (flag.abort) return finish('blocked', 'stopped by user');

      // Budget gate before EVERY model call.
      const inputEstimate = estimateTokens(system[0].text + JSON.stringify(messages));
      const budget = checkBudget(estimateCost(tier, inputEstimate, RUNNER_MAX_TOKENS));
      if (!budget.ok && !force) {
        audit(user.id, 'budget_gate', `runner loop #${loopId}: ${budget.reason}`);
        attachEvidence();
        return finish('blocked', `budget (${budget.reason}) — $${round4(budget.spentToday)} spent today; re-run with force to override`);
      }
      if (!budget.ok && force) audit(user.id, 'budget_override', `runner loop #${loopId}: ${budget.reason} overridden by ${user.name}`);

      send({ type: 'runner', state: 'model', iteration: i, max: MAX_ITERATIONS });
      const started = Date.now();
      let resp;
      try {
        resp = await completeWithTools({ model, system, messages, tools: TOOLS, maxTokens: RUNNER_MAX_TOKENS });
      } catch (err) {
        logRunnerCall({ userId: user.id, model, tier, usage: null, cost: 0, latencyMs: Date.now() - started, error: err.code || err.message });
        attachEvidence();
        return finish('blocked', `model call failed: ${err.code || err.message}`.slice(0, 280));
      }
      const cost = computeCost(tier, resp.usage);
      ctx.calls++; ctx.cost += cost;
      logRunnerCall({ userId: user.id, model, tier, usage: resp.usage, cost, latencyMs: Date.now() - started });
      send({ type: 'runner', state: 'model_done', iteration: i, cost: round4(cost), stopReason: resp.stopReason });

      messages.push({ role: 'assistant', content: resp.content });
      if (resp.stopReason !== 'tool_use') { finalText = resp.text; break; }

      const results = [];
      for (const block of resp.content.filter((b) => b.type === 'tool_use')) {
        if (flag.abort) { attachEvidence(); return finish('blocked', 'stopped by user'); }
        const t = await execTool(block.name, block.input || {}, ctx);
        loopEvent(loopId, { event: 'exec', actor: 'runner', note: t.note });
        send({ type: 'exec', tool: block.name, note: t.note, error: t.isError || undefined });
        results.push({ type: 'tool_result', tool_use_id: block.id, content: t.content, ...(t.isError ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
      if (i === MAX_ITERATIONS) limitReason = `iteration limit (${MAX_ITERATIONS}) reached`;
    }

    // ---- Conclude: evidence + final verify + honest transition -----------------
    if (ctx.files.size === 0) {
      const said = finalText ? ` — model said: ${finalText.slice(0, 180)}` : '';
      return finish('blocked', (limitReason ? `${limitReason}; ` : '') + `runner made no file changes${said}`.slice(0, 290));
    }

    // Reuse the model's own verify only if nothing was written after it.
    let verify = ctx.lastVerify && ctx.lastVerify.afterWrites === ctx.writeSeq ? ctx.lastVerify : null;
    if (!verify) {
      send({ type: 'runner', state: 'verify' });
      verify = await runVerify();
      loopEvent(loopId, { event: 'exec', actor: 'runner', note: `final run_verify → exit ${verify.exit_code} (${verify.passed ? 'pass' : 'fail'})` });
      send({ type: 'exec', tool: 'run_verify', note: `final verify → exit ${verify.exit_code}`, error: !verify.passed || undefined });
    }
    ctx.finalVerify = { exit_code: verify.exit_code, passed: verify.passed, tail: verify.tail };
    attachEvidence();

    if (verify.passed) {
      const summary = (finalText || `runner changed ${ctx.files.size} file(s); verify passed`).slice(0, 500)
        + (limitReason ? ` [${limitReason}]` : '');
      audit(user.id, 'runner_verifying', `loop #${loopId}: ${ctx.files.size} file(s), verify pass, $${round4(ctx.cost)}`);
      return finish('verifying', null, summary);
    }
    return finish('blocked', `verify failed (exit ${verify.exit_code}) after ${ctx.files.size} file change(s) — see evidence`);
  } finally {
    RUNNING.delete(loopId);
  }
}

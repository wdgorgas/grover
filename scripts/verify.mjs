#!/usr/bin/env node
/**
 * GROVER verify — the project's standing smoke test (docs/DECISIONS.md #6, #11).
 *
 *   node scripts/verify.mjs               full: syntax + boot + endpoints + mutations
 *   node scripts/verify.mjs --server-only skip client syntax checks
 *
 * Boots a second instance on port 4399 against a THROWAWAY data dir
 * (GROVER_DATA), so the battery can exercise mutations — the whole
 * improvement-request → proposal → approval → loop lifecycle — without ever
 * touching the real database. No API key is passed, so proposal generation
 * exercises the honest offline path. Zero dependencies.
 */
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4399;
const serverOnly = process.argv.includes('--server-only');

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };
const bad = (name, detail) => { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); };
const check = (name, cond, detail) => (cond ? ok(name) : bad(name, detail));

// ---- 1. Syntax checks --------------------------------------------------------
console.log('\nSyntax:');
const jsFiles = [];
const collect = (dir) => {
  for (const f of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (f.isFile() && /\.(mjs|js)$/.test(f.name)) jsFiles.push(join(dir, f.name));
  }
};
collect('server');
collect('scripts');
if (!serverOnly) collect('client/js');
jsFiles.push('grover.mjs');
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', join(ROOT, f)], { stdio: 'pipe' });
    ok(f);
  } catch (e) {
    bad(f, String(e.stderr).split('\n')[0]);
  }
}

// ---- 2. Boot on a throwaway data dir ------------------------------------------
console.log('\nServer (throwaway data dir):');
const tmpData = mkdtempSync(join(tmpdir(), 'grover-verify-'));
const child = spawn(process.execPath, [join(ROOT, 'grover.mjs')], {
  env: {
    ...process.env,
    GROVER_PORT: String(PORT),
    GROVER_NO_OPEN: '1',
    GROVER_DATA: tmpData,
    ANTHROPIC_API_KEY: '', // force the honest offline proposal path
  },
  stdio: 'pipe',
});
let booted = false;
child.stdout.on('data', (d) => { if (String(d).includes('Online at')) booted = true; });

const deadline = Date.now() + 8000;
while (!booted && Date.now() < deadline) await new Promise((r) => setTimeout(r, 150));

const B = `http://127.0.0.1:${PORT}`;
async function jreq(path, opts = {}) {
  const res = await fetch(B + path, {
    ...opts,
    headers: { 'content-type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const get = (p) => jreq(p);
const post = (p, body) => jreq(p, { method: 'POST', body });

if (!booted) {
  bad('boot', 'server did not come online in 8s');
} else {
  ok('boot');

  // ---- Read-only endpoint battery ---------------------------------------------
  const checks = [
    ['/api/bootstrap', (d) => d.user && Array.isArray(d.users) && d.settings],
    ['/api/status', (d) => typeof d.autonomyLevel === 'number' && Array.isArray(d.nextActions)],
    ['/api/ledger', (d) => Array.isArray(d) && d.length > 0], // seeded
    ['/api/loops', (d) => Array.isArray(d)],
    ['/api/skills', (d) => Array.isArray(d) && d.every((s) => s.kind)],
    ['/api/memory', (d) => Array.isArray(d)],
    ['/api/vault/tree', (d) => Array.isArray(d)],
    ['/api/costs/summary', (d) => d.spend && d.budgets],
    ['/api/costs/calls', (d) => Array.isArray(d)],
    ['/api/audit', (d) => Array.isArray(d)],
    ['/api/conversations', (d) => Array.isArray(d)],
    ['/api/docs', (d) => Array.isArray(d) && d.includes('LOOP_ENGINEERING.md')],
    ['/api/docs/LOOP_ENGINEERING.md', (d) => typeof d.content === 'string' && d.content.length > 100],
  ];
  for (const [path, validate] of checks) {
    try {
      const { status, data } = await get(path);
      check(path, status === 200 && validate(data), `status ${status}`);
    } catch (e) { bad(path, e.message); }
  }

  // Static assets
  for (const asset of ['/', '/css/tokens.css', '/css/app.css', '/js/app.js', '/js/orb.js', '/js/loop-ui.js']) {
    try {
      const res = await fetch(B + asset);
      res.ok ? ok(`static ${asset}`) : bad(`static ${asset}`, `status ${res.status}`);
    } catch (e) { bad(`static ${asset}`, e.message); }
  }
  // Path traversal must NOT serve server code
  try {
    const res = await fetch(`${B}/..%2fserver%2fconfig.mjs`);
    const text = await res.text();
    text.includes('<!doctype html') || res.status === 403
      ? ok('traversal guard')
      : bad('traversal guard', 'served non-HTML');
  } catch (e) { bad('traversal guard', e.message); }

  // ---- Mutation battery: Improvement Request lifecycle --------------------------
  console.log('\nImprovement Request → loop lifecycle:');
  try {
    // Propose from free text (offline skeleton — no key configured)
    let r = await post('/api/improvements/propose', { request: 'add a keyboard shortcut to focus the command input' });
    check('propose improvement (offline)', r.status === 200 && r.data.offline === true
      && r.data.draft?.title && r.data.proposal?.goal, `status ${r.status}`);
    check('proposal has verification + rollback + cost estimate',
      Array.isArray(r.data.proposal.verification) && r.data.proposal.verification.length >= 1
      && typeof r.data.proposal.rollback === 'string' && r.data.proposal.rollback.length > 0
      && typeof r.data.proposal.cost_estimate === 'string');
    const prop = r.data;

    // Empty request rejected
    r = await post('/api/improvements/propose', { request: '  ' });
    check('empty request rejected', r.status === 400);

    // Reject decision persists nothing
    const ledgerBefore = (await get('/api/ledger')).data.length;
    r = await post('/api/improvements', { decision: 'reject', request: 'bad idea', draft: prop.draft, proposal: prop.proposal });
    const ledgerAfterReject = (await get('/api/ledger')).data.length;
    check('reject creates nothing', r.status === 200 && ledgerAfterReject === ledgerBefore);

    // Save for later → pending ledger item with the proposal as its brief
    r = await post('/api/improvements', {
      decision: 'save', request: 'make task widgets draggable',
      draft: { title: 'Make task widgets draggable', category: 'feature', severity: 'low' },
      proposal: prop.proposal, offline: true,
    });
    const savedId = r.data.itemId;
    const savedItem = (await get('/api/ledger')).data.find((i) => i.id === savedId);
    check('save-for-later → pending item with brief', r.status === 200 && savedItem
      && savedItem.status === 'pending_greenlight' && savedItem.brief?.includes('**Goal.**'));

    // Approve → ledger item + loop created together
    r = await post('/api/improvements', {
      decision: 'approve', request: 'add a keyboard shortcut to focus the command input',
      draft: prop.draft, proposal: prop.proposal, offline: true,
    });
    const loop = r.data.loop;
    check('approve → loop created', r.status === 200 && loop?.status === 'approved'
      && loop.source === 'improvement' && Array.isArray(loop.verify_plan) && loop.verify_plan.length >= 1);
    const approvedItem = (await get('/api/ledger')).data.find((i) => i.id === r.data.itemId);
    check('approve → ledger item approved', approvedItem?.status === 'approved');

    // Events were written at birth
    r = await get(`/api/loops/${loop.id}/events`);
    check('loop has birth events', r.status === 200 && r.data.length >= 2
      && r.data.some((e) => e.to_status === 'approved'));

    // Illegal transition rejected
    r = await post(`/api/loops/${loop.id}/status`, { status: 'done' });
    check('illegal transition approved→done rejected', r.status === 400);

    // Blocking requires a reason
    r = await post(`/api/loops/${loop.id}/status`, { status: 'blocked' });
    check('block without reason rejected', r.status === 400);

    // Full happy path: approved → running → verifying → done
    r = await post(`/api/loops/${loop.id}/status`, { status: 'running' });
    check('approved → running', r.status === 200 && r.data.loop.status === 'running');
    r = await post(`/api/loops/${loop.id}/status`, { status: 'verifying' });
    check('running → verifying', r.status === 200 && r.data.loop.status === 'verifying');
    r = await post(`/api/loops/${loop.id}/status`, { status: 'done', summary: 'shortcut shipped; verified by hand' });
    check('verifying → done (with summary)', r.status === 200 && r.data.loop.status === 'done'
      && r.data.loop.summary?.includes('shipped'));
    const doneItem = (await get('/api/ledger')).data.find((i) => i.id === approvedItem.id);
    check('done loop closes its ledger item', doneItem?.status === 'done');
    r = await post(`/api/loops/${loop.id}/status`, { status: 'running' });
    check('terminal loop refuses transitions', r.status === 400);

    // Every transition is on the timeline
    r = await get(`/api/loops/${loop.id}/events`);
    const tos = r.data.map((e) => e.to_status);
    check('event timeline complete', ['approved', 'running', 'verifying', 'done'].every((s) => tos.includes(s)));

    // Block / unblock / kill on a second loop
    r = await post('/api/improvements', {
      decision: 'approve', request: 'better empty state on the Ledger',
      draft: { title: 'Better Ledger empty state', category: 'feature', severity: 'low' },
      proposal: prop.proposal, offline: true,
    });
    const loop2 = r.data.loop;
    r = await post(`/api/loops/${loop2.id}/status`, { status: 'blocked', reason: 'waiting on a design decision' });
    check('block with reason', r.status === 200 && r.data.loop.status === 'blocked'
      && r.data.loop.blocked_reason === 'waiting on a design decision');
    const status = (await get('/api/status')).data;
    check('blocked loop surfaces in status', status.counts.blockedLoops >= 1
      && status.nextActions.some((a) => a.includes('Unblock')));
    r = await post(`/api/loops/${loop2.id}/status`, { status: 'ready' });
    check('unblock → ready, reason cleared', r.status === 200 && r.data.loop.status === 'ready'
      && !r.data.loop.blocked_reason);
    r = await post(`/api/loops/${loop2.id}/status`, { status: 'killed', summary: 'superseded' });
    check('ready → killed', r.status === 200 && r.data.loop.status === 'killed');
  } catch (e) { bad('improvement lifecycle', e.message); }

  // ---- Mutation battery: Greenlight door (regression) ---------------------------
  console.log('\nGreenlight door:');
  try {
    const pendingItem = (await get('/api/ledger')).data.find((i) => i.status === 'pending_greenlight');
    let r = await post(`/api/ledger/${pendingItem.id}/proposal`, {});
    check('greenlight proposal (offline)', r.status === 200 && r.data.offline === true
      && Array.isArray(r.data.proposal.verification));
    r = await post(`/api/ledger/${pendingItem.id}/approve`, { proposal: r.data.proposal, offline: true });
    const glLoop = r.data.loop;
    check('greenlight approve → loop', r.status === 200 && glLoop?.status === 'approved'
      && glLoop.source === 'greenlight');
    r = await post(`/api/ledger/${pendingItem.id}/proposal`, {});
    check('re-greenlight is idempotent', r.status === 200 && r.data.alreadyLooped === true
      && r.data.loop.id === glLoop.id);
    r = await get(`/api/loops/${glLoop.id}/events`);
    check('greenlight loop has events too', r.status === 200 && r.data.length >= 2);
  } catch (e) { bad('greenlight lifecycle', e.message); }
}

child.kill();
await new Promise((r) => setTimeout(r, 400)); // let Windows release the db files
try { rmSync(tmpData, { recursive: true, force: true }); } catch { /* best effort */ }

console.log(`\n${pass} passed, ${fail} failed${serverOnly ? ' (server-only mode)' : ''}\n`);
process.exit(fail ? 1 : 0);

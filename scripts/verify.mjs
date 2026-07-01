#!/usr/bin/env node
/**
 * GROVER verify — the project's standing smoke test (docs/DECISIONS.md #6).
 *
 *   node scripts/verify.mjs              full: syntax + boot + endpoints
 *   node scripts/verify.mjs --server-only  skip client syntax checks
 *
 * Read-only against the app's data: boots a second instance on port 4399
 * and only issues GET requests, so it is safe to run while Grover is open.
 * Zero dependencies.
 */
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4399;
const serverOnly = process.argv.includes('--server-only');

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log(`  ✓ ${name}`); };
const bad = (name, detail) => { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); };

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

// ---- 2. Boot + read-only endpoint battery -------------------------------------
console.log('\nServer:');
const child = spawn(process.execPath, [join(ROOT, 'grover.mjs')], {
  env: { ...process.env, GROVER_PORT: String(PORT), GROVER_NO_OPEN: '1' },
  stdio: 'pipe',
});
let booted = false;
child.stdout.on('data', (d) => { if (String(d).includes('Online at')) booted = true; });

const deadline = Date.now() + 8000;
while (!booted && Date.now() < deadline) await new Promise((r) => setTimeout(r, 150));
if (!booted) {
  bad('boot', 'server did not come online in 8s');
} else {
  ok('boot');
  const B = `http://127.0.0.1:${PORT}`;
  const checks = [
    ['/api/bootstrap', (d) => d.user && Array.isArray(d.users) && d.settings],
    ['/api/status', (d) => typeof d.autonomyLevel === 'number' && Array.isArray(d.nextActions)],
    ['/api/ledger', (d) => Array.isArray(d)],
    ['/api/loops', (d) => Array.isArray(d)],
    ['/api/skills', (d) => Array.isArray(d) && d.every((s) => s.kind)],
    ['/api/memory', (d) => Array.isArray(d)],
    ['/api/vault/tree', (d) => Array.isArray(d)],
    ['/api/costs/summary', (d) => d.spend && d.budgets],
    ['/api/costs/calls', (d) => Array.isArray(d)],
    ['/api/audit', (d) => Array.isArray(d)],
    ['/api/conversations', (d) => Array.isArray(d)],
  ];
  for (const [path, validate] of checks) {
    try {
      const res = await fetch(B + path);
      const data = await res.json();
      if (res.ok && validate(data)) ok(path);
      else bad(path, `status ${res.status}`);
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
}
child.kill();

console.log(`\n${pass} passed, ${fail} failed${serverOnly ? ' (server-only mode)' : ''}\n`);
process.exit(fail ? 1 : 0);

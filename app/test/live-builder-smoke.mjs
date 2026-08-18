import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.ts';
import { GroverCore } from '../src/core.ts';

const fixture = mkdtempSync(join(tmpdir(), 'grover-builder-fixture-'));
const appDir = join(fixture, 'app');
const dataDir = mkdtempSync(join(tmpdir(), 'grover-builder-data-'));
mkdirSync(appDir, { recursive: true });
writeFileSync(join(fixture, 'AGENTS.md'), [
  '# Test fixture instructions',
  'This is an isolated GROVER Builder acceptance fixture.',
  'Make only the exact requested edit to target.txt. Run npm test in app. Do not change anything else.',
].join('\n'));
writeFileSync(join(fixture, 'target.txt'), 'Builder fixture\n');
writeFileSync(join(appDir, 'package.json'), JSON.stringify({
  name: 'grover-builder-fixture', private: true, scripts: { test: 'node test.js' },
}, null, 2));
writeFileSync(join(appDir, 'test.js'), [
  "const { readFileSync } = require('node:fs');",
  "const { join } = require('node:path');",
  "const content = readFileSync(join(__dirname, '..', 'target.txt'), 'utf8');",
  "if (!content.includes('GROVER_BUILDER_READY')) throw new Error('requested marker missing');",
  "console.log('fixture test passed');",
].join('\n'));

for (const args of [
  ['init'], ['config', 'user.name', 'GROVER Test'], ['config', 'user.email', 'grover-test@local'],
  ['add', '--all'], ['commit', '-m', 'fixture baseline'],
]) execFileSync('git', args, { cwd: fixture, windowsHide: true, stdio: 'ignore' });

const db = openDb(join(dataDir, 'grover.db'));
const core = new GroverCore({ db, dataDir, workspaceRoot: fixture });
const final = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('live Builder smoke timed out')), 180_000);
  const submitted = core.submit({
    text: 'Add a new line containing exactly GROVER_BUILDER_READY to target.txt. Make no other source changes.',
    context: 'builder',
    engine: 'codex-cli',
  });
  core.on('state', (state) => {
    const task = state.tasks.find((item) => item.task_id === submitted.taskId);
    if (!task || !['done', 'failed', 'cancelled'].includes(task.status)) return;
    clearTimeout(timeout);
    resolve({ state, task });
  });
});

assert.equal(final.task.status, 'done', final.task.internal_detail);
assert.match(readFileSync(join(fixture, 'target.txt'), 'utf8'), /GROVER_BUILDER_READY/);
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: fixture, encoding: 'utf8' }).trim();
assert.match(branch, /^codex\/grover-/);
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: fixture, encoding: 'utf8' }).trim(), '');
assert.ok(final.state.features[0].receipt_id, 'completed build has a receipt');
db.close();
console.log(`Live Builder smoke passed on ${branch}`);

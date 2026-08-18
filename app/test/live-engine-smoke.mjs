import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from '../src/db.ts';
import { GroverCore } from '../src/core.ts';

const engine = process.env.GROVER_TEST_ENGINE ?? 'codex-cli';
const root = resolve(import.meta.dirname, '..', '..');
const dataDir = mkdtempSync(join(tmpdir(), `grover-${engine}-`));
const db = openDb(join(dataDir, 'grover.db'));
const core = new GroverCore({ db, dataDir, workspaceRoot: root });

const result = await new Promise((resolveResult, reject) => {
  const timeout = setTimeout(() => reject(new Error(`${engine} smoke timed out`)), 90_000);
  const submitted = core.submit({
    text: 'Reply with exactly: GROVER_ENGINE_OK',
    intent: 'ask',
    engine,
  });
  core.on('state', (state) => {
    const task = state.tasks.find((item) => item.task_id === submitted.taskId);
    if (!task || !['done', 'failed'].includes(task.status)) return;
    clearTimeout(timeout);
    resolveResult({ task, state });
  });
});

assert.equal(result.task.status, 'done', result.task.internal_detail);
assert.match(result.task.internal_detail, /GROVER_ENGINE_OK/);
const expectedOutcome = process.env.GROVER_EXPECT_FALLBACK === 'true' ? 'passed:codex-cli' : `passed:${engine}`;
assert.match(result.state.routing[0].outcome, new RegExp(expectedOutcome));
db.close();
console.log(`${engine} live smoke passed`);

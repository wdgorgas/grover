import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GroverCore } from '../src/core.ts';
import { openDb } from '../src/db.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'grover-live-memory-'));
const dbPath = join(dataDir, 'grover.db');
let db = openDb(dbPath);
let core = new GroverCore({ db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..') });
core.memory.remember({
  id: 'live-recall',
  content: 'Will’s private verification code is QUARTZ-731.',
  source: 'live-memory-smoke',
});
db.close();

db = openDb(dbPath);
core = new GroverCore({ db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..') });
const submitted = core.submit({
  text: 'What is my private verification code? Reply with the code only.',
  context: 'general',
  engine: 'codex-cli',
});
const final = await new Promise((resolveResult, reject) => {
  const timeout = setTimeout(() => reject(new Error('Live memory recall timed out')), 90_000);
  const inspect = (state) => {
    const task = state.tasks.find((item) => item.task_id === submitted.taskId);
    if (!task || !['done', 'failed'].includes(task.status)) return;
    clearTimeout(timeout);
    core.off('state', inspect);
    resolveResult({ state, task });
  };
  core.on('state', inspect);
});

assert.equal(final.task.status, 'done', final.task.internal_detail);
const answer = final.state.messages.find((item) => item.conversation_id === submitted.conversationId && item.role === 'assistant');
assert.match(answer.content, /QUARTZ-731/);
db.close();
console.log('Live memory restart + relevant recall passed through Codex.');

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from '../src/db.ts';
import { GroverCore } from '../src/core.ts';

const engine = process.env.GROVER_TEST_ENGINE ?? 'codex-cli';
const prompt = process.env.GROVER_TEST_PROMPT ?? 'Reply with exactly: GROVER_ENGINE_OK';
const expectedText = process.env.GROVER_EXPECT_TEXT ?? 'GROVER_ENGINE_OK';
const root = resolve(import.meta.dirname, '..', '..');
const dataDir = mkdtempSync(join(tmpdir(), `grover-${engine}-`));
const db = openDb(join(dataDir, 'grover.db'));
const core = new GroverCore({ db, dataDir, workspaceRoot: root });

const result = await new Promise((resolveResult, reject) => {
  const timeout = setTimeout(() => reject(new Error(`${engine} smoke timed out`)), 90_000);
  const submitted = core.submit({
    text: prompt,
    engine,
  });
  core.on('state', (state) => {
    const task = state.tasks.find((item) => item.task_id === submitted.taskId);
    if (!task || !['done', 'failed'].includes(task.status)) return;
    clearTimeout(timeout);
    resolveResult({ task, state, conversationId: submitted.conversationId });
  });
});

assert.equal(result.task.status, 'done', result.task.internal_detail);
assert.match(result.task.internal_detail, new RegExp(expectedText, 'i'));
const conversation = result.state.conversations.find((item) => item.id === result.conversationId);
const assistant = result.state.messages.find((item) => item.conversation_id === result.conversationId && item.role === 'assistant');
assert.equal(conversation.context, 'general');
assert.match(assistant.content, new RegExp(expectedText, 'i'));
const expectedOutcome = process.env.GROVER_EXPECT_FALLBACK === 'true' ? 'passed:codex-cli' : `passed:${engine}`;
assert.match(result.state.routing[0].outcome, new RegExp(expectedOutcome));
if (engine === 'codex-cli') {
  assert.equal(result.state.routing[0].model_tier, 'fast');
  assert.equal(result.state.routing[0].selected_model, 'gpt-5.6-terra');
  assert.equal(result.state.routing[0].reasoning_effort, 'low');
}
db.close();
console.log(`${engine} live smoke passed`);

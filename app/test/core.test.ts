import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GroverCore } from '../src/core.ts';
import { openDb } from '../src/db.ts';
import { EngineRouter, type EngineRunOptions, type ExecutionEngine } from '../src/engine.ts';
import { addConversationMessage, createBuild, createConversation, createTask, transitionRun } from '../src/store.ts';

class WaitingEngine implements ExecutionEngine {
  readonly id = 'codex-cli';
  readonly displayName = 'Waiting Codex';
  readonly capabilities = ['ask', 'work', 'build'] as const;
  readonly available = true;
  private rejectors = new Map<string, (error: Error) => void>();

  run(options: EngineRunOptions): Promise<{ answer: string; costUsd: number }> {
    return new Promise((_resolve, reject) => this.rejectors.set(options.runKey, reject));
  }

  cancel(runKey: string): boolean {
    const reject = this.rejectors.get(runKey);
    if (!reject) return false;
    reject(new Error('cancelled'));
    this.rejectors.delete(runKey);
    return true;
  }
}

class NoopHarnessEngine implements ExecutionEngine {
  readonly id = 'noop-harness';
  readonly displayName = 'Noop Harness';
  readonly capabilities = ['ask', 'work', 'build'] as const;
  readonly available = true;
  modes: string[] = [];
  prompts: string[] = [];

  async run(options: EngineRunOptions): Promise<{ answer: string; costUsd: number }> {
    this.modes.push(options.mode);
    this.prompts.push(options.prompt);
    options.onUpdate({ kind: 'started', plainLanguage: 'Harness started' });
    options.onUpdate({ kind: 'progress', plainLanguage: 'Harness streamed progress' });
    return { answer: 'Harness finished cleanly', costUsd: 0 };
  }

  cancel(): boolean { return true; }
}

async function waitFor(check: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(message);
}

test('kill switch cancels active conversational work instead of leaving it running forever', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-core-'));
  const db = openDb(':memory:');
  const engine = new WaitingEngine();
  const core = new GroverCore({
    db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..'),
    router: new EngineRouter([engine]),
  });
  const { taskId } = core.submit({ text: 'What is active?', engine: 'codex-cli' });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  core.setKillSwitch(true);
  const state = core.getSnapshot() as any;
  const task = state.tasks.find((item: any) => item.task_id === taskId);
  assert.equal(task.status, 'cancelled');
  assert.deepEqual(JSON.parse(task.actions), []);
});

test('Noop engine swap preserves streaming task, conversation, cost, and event state', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-core-noop-'));
  const db = openDb(':memory:');
  const engine = new NoopHarnessEngine();
  const core = new GroverCore({
    db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..'),
    router: new EngineRouter([engine]),
  });
  const submitted = core.submit({ text: 'Build a new coding platform', engine: 'noop-harness' });
  await waitFor(() => (core.getSnapshot() as any).tasks[0]?.status === 'done', 'Noop task did not finish');
  const state = core.getSnapshot() as any;
  assert.equal(submitted.context, 'coding');
  assert.equal(submitted.intent, 'work');
  assert.deepEqual(engine.modes, ['work'], 'Coding work routes through a non-builder read-only mode');
  assert.equal(state.features.length, 0, 'Coding work did not become a GROVER Builder run');
  assert.match(state.messages.find((item: any) => item.role === 'assistant').content, /finished cleanly/);
  assert.ok(state.events.some((item: any) => item.plain_language === 'Harness streamed progress'));
  assert.equal(state.costs.estimated, 250_000);
});

test('profile greeting saves locally and answers without invoking an external engine', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-core-profile-greeting-'));
  const db = openDb(':memory:');
  const engine = new NoopHarnessEngine();
  const core = new GroverCore({
    db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..'),
    router: new EngineRouter([engine]),
  });
  const submitted = core.submit({ text: 'hey grover my name is will', engine: engine.id });
  await waitFor(() => (core.getSnapshot() as any).tasks[0]?.status === 'done', 'profile greeting did not finish');
  const state = core.getSnapshot() as any;
  const task = state.tasks.find((item: any) => item.task_id === submitted.taskId);
  assert.equal(task.domain, 'general');
  assert.equal(state.memoryProposals.length, 0);
  assert.equal(state.memories.length, 1);
  assert.match(state.memories[0].content, /Will's name is will/i);
  assert.deepEqual(engine.modes, []);
  assert.equal(state.routing[0].selected_engine, 'grover-local');
});

test('General branches before writing and local navigation reopens without polluting either conversation', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-core-context-branch-'));
  const db = openDb(':memory:');
  const engine = new NoopHarnessEngine();
  const core = new GroverCore({
    db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..'), router: new EngineRouter([engine]),
  });
  const general = createConversation(db, 'general', 'General catch-up');
  addConversationMessage(db, general, null, 'user', 'How are things?');
  addConversationMessage(db, general, null, 'assistant', 'Ready when you are.');

  const coding = core.submit({ text: "Let's code tictactoe", context: 'general', conversationId: general, engine: engine.id });
  await waitFor(() => (core.getSnapshot() as any).tasks.some((item: any) => item.task_id === coding.taskId && item.status === 'done'), 'coding branch did not finish');
  assert.equal(coding.context, 'coding');
  assert.equal(coding.conversationDisposition, 'branched');
  assert.notEqual(coding.conversationId, general);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM conversation_messages WHERE conversation_id = ?').get(general) as any).count, 2);

  const beforeNavigation = (db.prepare('SELECT COUNT(*) AS count FROM conversation_messages WHERE conversation_id = ?').get(coding.conversationId) as any).count;
  const reopened = core.submit({ text: 'Reopen tic tac toe', context: 'general', conversationId: general, engine: engine.id });
  assert.equal(reopened.conversationId, coding.conversationId);
  assert.equal(reopened.conversationDisposition, 'navigated');
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM conversation_messages WHERE conversation_id = ?').get(coding.conversationId) as any).count, beforeNavigation);
  assert.deepEqual(engine.modes, ['work'], 'navigation itself makes no second engine call');

  const update = core.submit({ text: 'Update tic tac toe', engine: engine.id });
  await waitFor(() => (core.getSnapshot() as any).tasks.some((item: any) => item.task_id === update.taskId && item.status === 'done'), 'project update did not finish');
  assert.equal(update.conversationId, coding.conversationId);
  assert.equal(update.context, 'coding');
  assert.equal(update.conversationDisposition, 'reopened');
  assert.deepEqual(engine.modes, ['work', 'work']);
});

test('worker receives bounded target conversation history and excludes unrelated conversations', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-core-history-'));
  const db = openDb(':memory:');
  const engine = new NoopHarnessEngine();
  const core = new GroverCore({
    db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..'), router: new EngineRouter([engine]),
  });
  const target = createConversation(db, 'coding', 'Tictactoe project');
  addConversationMessage(db, target, null, 'user', 'Use a three by three board and call the project Juniper.');
  addConversationMessage(db, target, null, 'assistant', 'Juniper will use a three by three board.');
  const unrelated = createConversation(db, 'coding', 'Unrelated project');
  addConversationMessage(db, unrelated, null, 'user', 'UNRELATED_SECRET_MARKER');

  const submitted = core.submit({ text: 'What should we implement next?', context: 'coding', conversationId: target, engine: engine.id });
  await waitFor(() => (core.getSnapshot() as any).tasks.some((item: any) => item.task_id === submitted.taskId && item.status === 'done'), 'follow-up did not finish');
  assert.match(engine.prompts[0], /three by three board/);
  assert.match(engine.prompts[0], /Juniper/);
  assert.doesNotMatch(engine.prompts[0], /UNRELATED_SECRET_MARKER/);
});

test('Builder pause, resume, and cancel transitions work through the core', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'grover-core-build-actions-'));
  writeFileSync(join(fixture, 'AGENTS.md'), '# Test fixture\n');
  for (const args of [
    ['init'], ['config', 'user.name', 'GROVER Test'], ['config', 'user.email', 'grover-test@local'],
    ['add', '--all'], ['commit', '-m', 'fixture baseline'],
  ]) execFileSync('git', args, { cwd: fixture, windowsHide: true, stdio: 'ignore' });
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-core-build-actions-data-'));
  const db = openDb(':memory:');
  const core = new GroverCore({ db, dataDir, workspaceRoot: fixture, router: new EngineRouter([new WaitingEngine()]) });
  const { taskId } = core.submit({ text: 'Add a harmless fixture line', context: 'builder', engine: 'codex-cli' });
  await waitFor(() => (db.prepare('SELECT status FROM build_runs').get() as any)?.status === 'running', 'Builder did not start');
  core.taskAction(taskId, 'pause');
  assert.equal((db.prepare('SELECT status FROM build_runs').get() as any).status, 'paused');
  await new Promise((resolveWait) => setImmediate(resolveWait));
  core.taskAction(taskId, 'resume');
  await waitFor(() => (db.prepare('SELECT status FROM build_runs').get() as any)?.status === 'running', 'Builder did not resume');
  core.taskAction(taskId, 'cancel');
  assert.equal((db.prepare('SELECT status FROM build_runs').get() as any).status, 'cancelled');
});

test('jackson-private fails closed before any engine or Builder run starts', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-core-private-'));
  const db = openDb(':memory:');
  const engine = new NoopHarnessEngine();
  const core = new GroverCore({
    db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..'),
    router: new EngineRouter([engine]),
  });
  const submitted = core.submit({ text: 'Add a feature that reads jackson-private files', context: 'builder' });
  const state = core.getSnapshot() as any;
  assert.equal(state.tasks.find((item: any) => item.task_id === submitted.taskId).status, 'failed');
  assert.equal(state.features.length, 0);
  assert.deepEqual(engine.modes, []);
  assert.match(state.messages.find((item: any) => item.role === 'assistant').content, /fails closed/i);
});

test('app restart pauses an interrupted build and records a resumable recovery state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'grover-core-recovery-'));
  const path = join(directory, 'grover.db');
  const first = openDb(path);
  const taskId = createTask(first, 'build', 'Add a recovery fixture', 'builder');
  const { runId } = createBuild(first, taskId, 'Add a recovery fixture');
  transitionRun(first, runId, 'running', 'editing', 'Editing before the simulated crash');
  first.close();

  const second = openDb(path);
  const core = new GroverCore({ db: second, dataDir: directory, workspaceRoot: resolve(import.meta.dirname, '..', '..') });
  const state = core.getSnapshot() as any;
  assert.equal(state.features[0].run_status, 'paused');
  const recovery = JSON.parse(state.features[0].recovery_state);
  assert.equal(recovery.reason, 'app_restart');
  assert.match(recovery.nextAction, /Resume/);
  assert.deepEqual(recovery.changedFiles, []);
  assert.equal(recovery.revertState, 'not_inspected');
  assert.ok(Array.isArray(recovery.evidenceCollected));
  assert.equal((second.prepare('SELECT COUNT(*) AS count FROM recovery_cards WHERE build_run_id = ?').get(runId) as any).count, 1);
  assert.ok(state.events.some((event: any) => event.plain_language.includes('GROVER restarted')));
});

test('renderer-like invalid workspace input is rejected at runtime', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-core-invalid-'));
  const db = openDb(':memory:');
  const core = new GroverCore({ db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..') });
  assert.throws(() => core.submit({ text: 'bad', context: 'teleport' as never }), /Unknown conversation workspace/);
});

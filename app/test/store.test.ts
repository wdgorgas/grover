import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.ts';
import {
  addEvidence, checkBudget, closureReady, completeReceipt, completeRoutingDecision,
  addConversationMessage, createBuild, createConversation, createTask, deleteMemory, engineRanking, inferContext, inferIntent, moveConversation, rateTaskRouting,
  getEngineModelProfile, recordCost, recordRoutingDecision, resolveConversation, saveMemory, selectModelTier, snapshot, transitionRun,
} from '../src/store.ts';

test('intent routing distinguishes the five front-door commitments', () => {
  assert.equal(inferIntent('What does this architecture do?'), 'ask');
  assert.equal(inferIntent('Write a concise project brief'), 'work');
  assert.equal(inferIntent('Deploy the app'), 'act');
  assert.equal(inferIntent('Fix the GROVER app settings'), 'build');
  assert.equal(inferIntent('Create a GROVER feature'), 'build');
  assert.equal(inferIntent('Build a new coding platform'), 'work');
  assert.equal(inferIntent('Remember that I prefer local apps'), 'remember');
});

test('context routing organizes common requests without a user intent selector', () => {
  assert.equal(inferContext('hi, my name is Will'), 'general');
  assert.equal(inferContext("Let's design a new coding platform that does xyz"), 'coding');
  assert.equal(inferContext('Help me compare retirement portfolio options'), 'finance');
  assert.equal(inferContext('Make a weekly workout and nutrition plan'), 'health');
  assert.equal(inferContext('Research the evidence and sources for this paper'), 'research');
  assert.equal(inferContext('Fix the GROVER app settings'), 'builder');
  assert.equal(inferContext('Code a quant bot for investing'), 'coding', 'the work product outranks its eventual finance domain');
  assert.equal(inferContext('Set my schedule for the research meeting'), 'general', 'meeting subject does not become the work context');
});

test('context branching preserves General and named continuation reopens the existing project', () => {
  const db = openDb(':memory:');
  const general = createConversation(db, 'general', 'Hi GROVER');
  addConversationMessage(db, general, null, 'user', 'Hi GROVER');
  addConversationMessage(db, general, null, 'assistant', 'Hi Will.');

  const branch = resolveConversation(
    db,
    "Let's code tic tac toe",
    { context: 'coding', explicit: true, reason: 'Software work.' },
    general,
    'general',
  );
  assert.equal(branch.context, 'coding');
  assert.equal(branch.disposition, 'branched');
  assert.notEqual(branch.conversationId, general);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM conversation_messages WHERE conversation_id = ?').get(general) as any).count, 2);

  addConversationMessage(db, branch.conversationId, null, 'user', "Let's code tic tac toe");
  const reopen = resolveConversation(
    db,
    'Update tictactoe',
    { context: 'general', explicit: false, reason: 'No specialist signal.' },
  );
  assert.equal(reopen.conversationId, branch.conversationId);
  assert.equal(reopen.context, 'coding');
  assert.equal(reopen.disposition, 'reopened');

  const navigate = resolveConversation(
    db,
    'Reopen tic tac toe',
    { context: 'general', explicit: false, reason: 'No specialist signal.' },
    general,
    'general',
  );
  assert.equal(navigate.conversationId, branch.conversationId);
  assert.equal(navigate.disposition, 'navigated');
  assert.equal(navigate.localNavigation, true);

  const conversationalNavigate = resolveConversation(
    db,
    'hey grover can you open up the tic tac toe project',
    { context: 'general', explicit: false, reason: 'No specialist signal.' },
    general,
    'general',
  );
  assert.equal(conversationalNavigate.conversationId, branch.conversationId);
  assert.equal(conversationalNavigate.disposition, 'navigated');
  assert.equal(conversationalNavigate.localNavigation, true);
});

test('conversations persist messages and remain grouped by context', () => {
  const db = openDb(':memory:');
  const conversationId = createConversation(db, 'coding', 'Design a coding platform');
  const taskId = createTask(db, 'work', 'Design a coding platform', 'coding');
  addConversationMessage(db, conversationId, taskId, 'user', 'Design a coding platform');
  addConversationMessage(db, conversationId, taskId, 'assistant', 'Here is a practical architecture.');
  let state = snapshot(db) as any;
  assert.equal(state.conversations[0].context, 'coding');
  assert.deepEqual(state.messages.map((message: any) => message.role), ['user', 'assistant']);
  assert.equal(state.tasks[0].domain, 'coding');
  moveConversation(db, conversationId, 'business');
  state = snapshot(db) as any;
  assert.equal(state.conversations[0].context, 'business');
  assert.equal(state.contextRouting[0].initial_context, 'coding');
  assert.equal(state.contextRouting[0].final_context, 'business');
  assert.ok(state.contextRouting[0].corrected_at);
});

test('Builder object creation is atomic and records the selected engine', () => {
  const db = openDb(':memory:');
  const taskId = createTask(db, 'build', 'Add a useful local feature');
  const { featureId, runId } = createBuild(db, taskId, 'Add a useful local feature', 'codex-cli');
  const feature = db.prepare('SELECT * FROM feature_requests WHERE id = ?').get(featureId) as Record<string, unknown>;
  const run = db.prepare('SELECT * FROM build_runs WHERE id = ?').get(runId) as Record<string, unknown>;
  const checks = db.prepare('SELECT COUNT(*) AS count FROM acceptance_checks WHERE build_run_id = ?').get(runId) as { count: number };
  assert.equal(feature.active_build_run_id, runId);
  assert.equal(run.engine_id, 'codex-cli');
  assert.equal(checks.count, 2);
});

test('pause and resume actions come only from the reducer projection', () => {
  const db = openDb(':memory:');
  const taskId = createTask(db, 'build', 'Change GROVER');
  const { runId } = createBuild(db, taskId, 'Change GROVER');
  transitionRun(db, runId, 'paused', 'paused', 'Paused safely');
  const task = db.prepare('SELECT status, actions FROM task_state WHERE task_id = ?').get(taskId) as { status: string; actions: string };
  assert.equal(task.status, 'paused');
  assert.deepEqual(JSON.parse(task.actions), ['resume', 'cancel']);
});

test('closure requires every required trusted evidence type and a receipt', () => {
  const db = openDb(':memory:');
  const taskId = createTask(db, 'build', 'Change GROVER');
  const { runId } = createBuild(db, taskId, 'Change GROVER');
  addEvidence(db, runId, `${runId}:automated-tests`, 'test_output', 'test_runner', 'test.txt', 'passed');
  addEvidence(db, runId, `${runId}:recorded-change`, 'git_diff', 'git', 'diff.txt', 'diff');
  completeReceipt(db, runId, 'receipt');
  assert.equal(closureReady(db, runId), false, 'commit evidence is still missing');
  addEvidence(db, runId, `${runId}:recorded-change`, 'commit', 'git', 'git:abc', 'commit');
  assert.equal(closureReady(db, runId), true);
});

test('hard-cap check blocks a near-cap crossing before model work', () => {
  const db = openDb(':memory:');
  recordCost(db, 'task', null, 'actual', 49_500_000, 'seed');
  assert.doesNotThrow(() => checkBudget(db, 500_000));
  assert.throws(() => checkBudget(db, 500_001), /hard cap/);
});

test('cost ledger and budget settings survive a database restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'grover-cost-restart-'));
  const path = join(directory, 'grover.db');
  const first = openDb(path);
  recordCost(first, 'restart-task', null, 'actual', 123_456, 'restart proof', 'test', 'noop');
  first.close();
  const second = openDb(path);
  const state = snapshot(second) as any;
  assert.equal(state.costs.actual, 123_456);
  assert.equal(state.budget.hard_micro_usd, 50_000_000);
  second.close();
});

test('direct memory persists, deletes from active retrieval, and routing stays explainable', () => {
  const db = openDb(':memory:');
  const memoryId = saveMemory(db, 'Prefer local desktop applications');
  const routingId = recordRoutingDecision(db, 'task', 'ask', 'codex-cli', 'claude-cli', 'Codex preferred', false);
  completeRoutingDecision(db, routingId, 'passed:codex-cli');
  rateTaskRouting(db, 'task', 'positive');
  let state = snapshot(db) as any;
  assert.equal(state.memories.length, 1);
  assert.equal(state.routing[0].reason, 'Codex preferred');
  assert.equal(state.routing[0].outcome, 'passed:codex-cli');
  assert.equal(state.routing[0].rating, 'positive');
  deleteMemory(db, memoryId);
  state = snapshot(db) as any;
  assert.equal(state.memories.length, 0);
});

test('manager ranking learns from outcomes and explicit usefulness feedback', () => {
  const db = openDb(':memory:');
  for (let i = 0; i < 3; i += 1) {
    const id = recordRoutingDecision(db, `task-${i}`, 'ask', 'claude-cli', null, 'test', false);
    completeRoutingDecision(db, id, 'passed:claude-cli');
    rateTaskRouting(db, `task-${i}`, 'positive');
  }
  const ranking = engineRanking(db, 'ask');
  assert.equal(ranking[0].id, 'claude-cli', 'enough successful positive evidence can outrank the initial Codex prior');
});

test('abstract workload tiers map to configurable Codex profiles', () => {
  const db = openDb(':memory:');
  assert.equal(selectModelTier('ask', 'general', 'Explain this briefly'), 'fast');
  assert.equal(selectModelTier('work', 'health', 'Prepare a gym routine'), 'balanced');
  assert.equal(selectModelTier('work', 'coding', 'Implement the game', true), 'frontier');
  assert.equal(selectModelTier('build', 'builder', 'Change GROVER'), 'frontier');
  assert.deepEqual(getEngineModelProfile(db, 'codex-cli', 'fast'), {
    tier: 'fast', modelId: 'gpt-5.6-terra', reasoningEffort: 'low',
  });
  assert.deepEqual(getEngineModelProfile(db, 'codex-cli', 'frontier'), {
    tier: 'frontier', modelId: 'gpt-5.6-sol', reasoningEffort: 'high',
  });
});

test('lane contracts refuse cross-lane authority and jackson-private access', () => {
  const db = openDb(':memory:');
  const rows = db.prepare('SELECT * FROM domain_contracts').all() as any[];
  const builder = rows.find((row) => row.domain === 'builder');
  const coding = rows.find((row) => row.domain === 'coding');
  assert.equal(builder.can_edit_grover, 1);
  assert.equal(coding.can_edit_grover, 0);
  for (const row of rows) {
    assert.ok(!JSON.parse(row.readable_namespaces).includes('jackson-private'));
  }
});

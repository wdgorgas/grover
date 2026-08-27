import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GroverCore } from '../src/core.ts';
import { openDb } from '../src/db.ts';
import { CodexCliEngine, EngineRouter } from '../src/engine.ts';
import { LocalManagerRuntime } from '../src/manager.ts';
import { ProjectMemoryService } from '../src/project-memory.ts';
import { addConversationMessage, createConversation } from '../src/store.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'grover-manager-recovery-live-'));
const projectsRoot = join(dataDir, 'projects');
const db = openDb(join(dataDir, 'grover.db'));
const manager = new LocalManagerRuntime();
const workerPrompts = [];
let engineCalls = 0;
const realCodex = process.env.GROVER_RECOVERY_REAL_CODEX === 'true';
const codex = realCodex ? new CodexCliEngine() : null;
const engine = {
  id: 'codex-cli',
  displayName: realCodex ? 'Codex' : 'Codex recovery fixture',
  capabilities: ['ask', 'work', 'project'],
  get available() { return realCodex ? codex.available : true; },
  probeAuth: realCodex ? () => codex.probeAuth() : undefined,
  run: async (input) => {
    engineCalls += 1;
    workerPrompts.push(input.prompt);
    if (realCodex) return codex.run(input);
    writeFileSync(join(input.cwd, 'guess_game.py'), 'MIN_NUMBER = 1\nMAX_NUMBER = 15\n', 'utf8');
    return {
      answer: 'Updated the existing Guess and Check project to use numbers 1 through 15. Verified guess_game.py exists and contains MAX_NUMBER = 15.',
      costUsd: 0,
    };
  },
  cancel: (runKey) => realCodex ? codex.cancel(runKey) : false,
};

async function waitForTerminal(core, taskId, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = core.getSnapshot();
    const task = snapshot.tasks.find((item) => item.task_id === taskId);
    if (['done', 'blocked', 'failed', 'cancelled'].includes(task?.status)) return { snapshot, task };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Task ${taskId} did not finish within ${timeoutMs}ms.`);
}

try {
  await manager.start();
  assert.equal(manager.status().state, 'ready', manager.status().detail);
  const conversationId = createConversation(db, 'coding', 'Guess and check game');
  const original = 'Code a guess and check game using numbers 1-10.';
  addConversationMessage(db, conversationId, null, 'user', original);
  addConversationMessage(db, conversationId, null, 'assistant', [
    'Created `guess_game.py`:',
    '```python',
    'import random',
    'target = random.randint(1, 10)',
    'guess = int(input("Guess a number from 1 to 10: "))',
    'print("Correct!" if guess == target else f"Try again; the number was {target}.")',
    '```',
  ].join('\n'));
  new ProjectMemoryService(db, dataDir).ensureProject(
    conversationId, 'coding', 'Guess and check game', original,
  );
  const core = new GroverCore({
    db, dataDir, projectsRoot, manager, router: new EngineRouter([engine]),
  });

  const opened = await core.submitManaged({ text: 'hey grover can you open up the guess and check project' });
  const openedState = await waitForTerminal(core, opened.taskId);
  assert.equal(openedState.task.status, 'done');
  assert.equal(opened.conversationId, conversationId);
  assert.equal(opened.conversationDisposition, 'navigated');
  assert.equal(engineCalls, 0, 'navigation invoked a specialist worker');

  const expanded = await core.submitManaged({
    text: 'hey grover, lets expand the guess and check game to be numbers 1-15 instead of 1-10',
  });
  let expandedState = await waitForTerminal(core, expanded.taskId, realCodex ? 240_000 : 60_000);
  if (expandedState.task.status === 'blocked') {
    const assistant = expandedState.snapshot.messages.find(
      (message) => message.task_id === expanded.taskId && message.role === 'assistant',
    );
    assert.ok(assistant?.content, 'blocked project update did not display its clarification');
    const resumed = await core.submitManaged({
      text: 'C drive is alright, or just whatever local directory you have',
      context: 'coding',
      conversationId: expanded.conversationId,
    });
    expandedState = await waitForTerminal(core, resumed.taskId, realCodex ? 240_000 : 60_000);
  }
  assert.equal(expandedState.task.status, 'done', JSON.stringify(expandedState.task));
  assert.equal(expanded.conversationId, conversationId);
  assert.ok(engineCalls >= 1 && engineCalls <= 2, 'project expansion exceeded one worker plus one bounded verifier');
  const projectEngineCalls = engineCalls;
  const linked = expandedState.snapshot.projects.find((project) => project.conversation_id === conversationId);
  assert.ok(linked?.root_path, 'manager-authorized project update did not materialize its local folder');
  const codePath = join(linked.root_path, 'guess_game.py');
  assert.equal(existsSync(codePath), true);
  assert.match(readFileSync(codePath, 'utf8'), /MAX_NUMBER = 15/);
  assert.match(workerPrompts[0], /numbers 1-15/i);

  const scheduleText = 'can you set my daily schedule: Gym every day 9-11am, School from 12-1 and 4-6, Research from 1-4, capstone project work at 6-8';
  const scheduled = await core.submitManaged({ text: scheduleText });
  const scheduledState = await waitForTerminal(core, scheduled.taskId);
  assert.equal(scheduledState.task.status, 'done', JSON.stringify(scheduledState.task));
  assert.equal(engineCalls, projectEngineCalls, 'local schedule storage invoked the specialist worker');
  const scheduleMemory = db.prepare(
    `SELECT category, content FROM memories WHERE category LIKE 'manager:context:%'
     AND deleted_at IS NULL AND superseded_by IS NULL ORDER BY updated_at DESC LIMIT 1`
  ).get();
  assert.ok(scheduleMemory?.content, 'daily schedule was not stored in Lifestyle memory');
  assert.match(scheduleMemory.content, /Gym|gym/);
  assert.match(scheduleMemory.content, /School from 12-1 and 4-6/);
  const scheduleAnswer = scheduledState.snapshot.messages.find(
    (message) => message.task_id === scheduled.taskId && message.role === 'assistant',
  );
  assert.match(scheduleAnswer?.content ?? '', /saved.*Lifestyle vault/i);

  const distinctInput = {
    request: 'Create a separate new Guess and check game project.',
    resolved_destination: 'coding',
    current_conversation: null,
    candidate_conversations: [{
      id: conversationId, title: 'Guess and check game', context: 'coding',
      project_id: new ProjectMemoryService(db, dataDir).getByConversation(conversationId).id, status: 'active',
    }],
  };
  const distinctFirst = await manager.inferContinuity(distinctInput);
  assert.ok(['create', 'branch'].includes(distinctFirst.output.decision.action));
  assert.ok(distinctFirst.output.decision.rationale_codes.includes('explicit_new_project'));
  assert.equal(distinctFirst.output.decision.target_conversation_id, null);

  const stageSummary = scheduledState.snapshot.managerStages.reduce((summary, stage) => {
    summary[stage.stage] = (summary[stage.stage] ?? 0) + 1;
    return summary;
  }, {});
  console.log(`Live manager recovery passed: ${JSON.stringify({
    navigation_task: opened.taskId,
    project_task: expanded.taskId,
    project_file: codePath,
    schedule_task: scheduled.taskId,
    real_codex: realCodex,
    engine_calls: engineCalls,
    stages: stageSummary,
  })}`);
} finally {
  manager.stop();
  db.close();
}

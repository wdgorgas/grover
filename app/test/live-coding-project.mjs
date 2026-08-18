import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';
import { GroverCore } from '../src/core.ts';
import { openDb } from '../src/db.ts';
import { CodexCliEngine, EngineRouter } from '../src/engine.ts';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const dataDir = mkdtempSync(join(tmpdir(), 'grover-live-coding-'));
const projectsRoot = join(dataDir, 'projects');
const resultDir = join(resolve(import.meta.dirname, '..'), 'test-results');
mkdirSync(resultDir, { recursive: true });
const db = openDb(join(dataDir, 'grover.db'));
const core = new GroverCore({
  db,
  dataDir,
  projectsRoot,
  workspaceRoot: repoRoot,
  router: new EngineRouter([new CodexCliEngine()]),
});

function repoStatus() {
  return execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
}

async function waitForTask(taskId) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const state = core.getSnapshot();
    const task = state.tasks.find((item) => item.task_id === taskId);
    if (['done', 'failed', 'cancelled'].includes(task?.status)) return { state, task };
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('Live Coding project did not finish within three minutes.');
}

const before = repoStatus();
await core.refreshEngineStatus();
const submitted = core.submit({
  text: 'Code a minimal browser tic tac toe game. Create index.html with inline CSS and JavaScript. Use exactly nine playable buttons carrying data-cell="0" through data-cell="8", expose the turn or winner in an element carrying data-status, make turns and win detection functional, and do not ask follow-up questions.',
  engine: 'codex-cli',
});
const { state, task } = await waitForTask(submitted.taskId);
assert.equal(task.status, 'done', state.messages.find((item) => item.task_id === submitted.taskId && item.role === 'assistant')?.content);
assert.equal(submitted.context, 'coding');
const project = state.projects.find((item) => item.conversation_id === submitted.conversationId);
assert.ok(project, 'No project record was created.');
assert.ok(project.root_path.startsWith(projectsRoot), 'Project escaped the isolated projects root.');
const indexPath = join(project.root_path, 'index.html');
assert.equal(existsSync(indexPath), true, 'Codex did not create index.html.');
const html = readFileSync(indexPath, 'utf8');
assert.match(html, /<html|<!doctype/i);
assert.match(html, /tic.?tac.?toe/i);
assert.match(html, /script/i);
const routing = state.routing.find((item) => item.task_id === submitted.taskId);
assert.equal(routing.model_tier, 'frontier');
assert.equal(routing.selected_model, 'gpt-5.6-sol');
assert.equal(routing.reasoning_effort, 'high');
assert.equal(repoStatus(), before, 'The Coding worker changed the GROVER repository.');

const preview = await electron.launch({
  args: [join(import.meta.dirname, 'project-preview-main.mjs')],
  cwd: resolve(import.meta.dirname, '..'),
  env: { ...process.env, GROVER_PROJECT_HTML: indexPath },
});
try {
  const page = await preview.firstWindow();
  assert.equal(await page.locator('[data-cell]').count(), 9, 'The game did not render nine playable cells.');
  for (const cell of ['0', '3', '1', '4', '2']) await page.locator(`[data-cell="${cell}"]`).click();
  assert.match(await page.locator('[data-status]').textContent(), /x.*win|win.*x/i, 'The rendered game did not detect an X win.');
  await page.screenshot({ path: join(resultDir, 'live-coding-tictactoe.png'), fullPage: true });
} finally {
  await preview.close();
}
db.close();

console.log(`Live Coding project passed: ${indexPath}; screenshot: ${join(resultDir, 'live-coding-tictactoe.png')}`);

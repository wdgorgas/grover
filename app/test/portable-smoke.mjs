import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const appDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appDir, '..');
const executable = process.env.GROVER_PORTABLE_EXE ?? join(appDir, 'release', 'GROVER-2.0.0-rc.3-portable.exe');
const prompt = process.env.GROVER_PORTABLE_PROMPT ?? 'Reply with exactly: GROVER_PORTABLE_CODEX_OK';
const expected = process.env.GROVER_PORTABLE_EXPECT ?? 'GROVER_PORTABLE_CODEX_OK';
const dataDir = mkdtempSync(join(tmpdir(), 'grover-portable-smoke-'));
const resultDir = join(appDir, 'test-results');
mkdirSync(resultDir, { recursive: true });
const port = 19333;

function endpointReady() {
  return new Promise((resolveReady) => {
    const request = get(`http://127.0.0.1:${port}/json/version`, (response) => {
      response.resume();
      resolveReady(response.statusCode === 200);
    });
    request.once('error', () => resolveReady(false));
    request.setTimeout(800, () => { request.destroy(); resolveReady(false); });
  });
}

async function waitForEndpoint() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await endpointReady()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('Portable GROVER did not expose its test connection within 60 seconds.');
}

const child = spawn(executable, [`--remote-debugging-port=${port}`], {
  cwd: appDir,
  windowsHide: true,
  env: {
    ...process.env,
    GROVER_TEST_DATA_DIR: dataDir,
    GROVER_TEST_WORKSPACE_ROOT: repoRoot,
  },
  stdio: 'ignore',
});

let browser;
try {
  await waitForEndpoint();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => candidate.url().startsWith('file:')) ?? pages[0];
  await page.waitForSelector('#home-request');
  await page.waitForFunction(() => document.querySelector('#engine-status')?.textContent?.includes('Codex ready'));
  const functional = await page.evaluate(async () => {
    await window.grover.setKillSwitch(true);
    const profile = await window.grover.submit({ text: 'hi, my name is Portable Will' });
    let state = await window.grover.snapshot();
    const general = state.conversations.find((item) => item.id === profile.conversationId);
    const generalBefore = state.messages.filter((item) => item.conversation_id === general.id).length;
    const branch = await window.grover.submit({
      text: "Let's code packaged tictactoe",
      context: 'general',
      conversationId: general.id,
      engine: 'codex-cli',
    });
    const deadline = Date.now() + 10_000;
    do {
      state = await window.grover.snapshot();
      const task = state.tasks.find((item) => item.task_id === branch.taskId);
      if (task && ['failed', 'done'].includes(task.status)) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    } while (Date.now() < deadline);
    const project = state.projects.find((item) => item.conversation_id === branch.conversationId);
    const codingBeforeNavigation = state.messages.filter((item) => item.conversation_id === branch.conversationId).length;
    const navigation = await window.grover.submit({
      text: 'Reopen packaged tic tac toe',
      context: 'general',
      conversationId: general.id,
    });
    state = await window.grover.snapshot();
    const memoryMatches = await window.grover.searchMemories('Portable Will');
    await window.grover.setKillSwitch(false);
    return {
      branch,
      navigation,
      project,
      generalBefore,
      generalAfter: state.messages.filter((item) => item.conversation_id === general.id).length,
      codingBeforeNavigation,
      codingAfterNavigation: state.messages.filter((item) => item.conversation_id === branch.conversationId).length,
      memoryMatches,
      modelProfiles: state.modelProfiles,
    };
  });
  assert.equal(functional.branch.context, 'coding');
  assert.equal(functional.branch.conversationDisposition, 'branched');
  assert.equal(functional.generalAfter, functional.generalBefore);
  assert.equal(functional.navigation.conversationId, functional.branch.conversationId);
  assert.equal(functional.navigation.conversationDisposition, 'navigated');
  assert.equal(functional.codingAfterNavigation, functional.codingBeforeNavigation);
  assert.ok(functional.project?.root_path, 'Packaged Coding project folder was not created.');
  assert.match(functional.memoryMatches[0]?.content ?? '', /Portable Will/i);
  assert.ok(functional.modelProfiles.some((item) => item.model_id === 'gpt-5.6-sol'));
  assert.equal(await page.locator('#coding-project').isVisible(), false, 'Project controls leaked into General.');
  await page.locator('#home-request').fill(prompt);
  await page.locator('#home-engine').selectOption('codex-cli');
  await page.locator('#home-request').press('Enter');
  const answer = page.locator('#chat-messages .message.assistant .message-content').filter({ hasText: expected }).last();
  await answer.waitFor({ timeout: 90_000 });
  assert.match(await answer.textContent(), new RegExp(expected));
  await page.screenshot({ path: join(resultDir, 'packaged-portable-functional.png'), fullPage: true });
  console.log('Portable executable smoke passed with live bundled Codex.');
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolveKill) => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolveKill()));
}

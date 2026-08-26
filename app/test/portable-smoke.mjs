import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const appDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appDir, '..');
const version = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')).version;
const executable = process.env.GROVER_PORTABLE_EXE ?? join(appDir, 'release', `GROVER-${version}-portable.exe`);
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
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    if (await endpointReady()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('Portable GROVER did not expose its test connection within five minutes.');
}

const launchedAt = Date.now();
const child = spawn(executable, [`--remote-debugging-port=${port}`], {
  cwd: appDir,
  windowsHide: true,
  env: {
    ...process.env,
    GROVER_TEST_DATA_DIR: dataDir,
    GROVER_TEST_WORKSPACE_ROOT: repoRoot,
    GROVER_TEST_MANAGER: 'true',
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
  await page.waitForFunction(
    () => document.querySelector('#manager-status')?.textContent === 'Manager ready', null, { timeout: 180_000 },
  );
  await page.waitForFunction(
    () => document.querySelector('#engine-status')?.textContent?.includes('Codex ready'), null, { timeout: 90_000 },
  );
  const startup = await page.evaluate(async () => (await window.grover.snapshot()).runtime.managerStatus);
  assert.equal(startup.state, 'ready');
  assert.match(startup.detail, /Bundled local manager/i, 'portable app did not select its bundled manager');
  const startupMs = Date.now() - launchedAt;

  const greetingStartedAt = Date.now();
  await page.locator('#home-request').fill('Hello');
  await page.locator('#home-request').press('Enter');
  const greetingDeadline = Date.now() + 180_000;
  let state;
  do {
    state = await page.evaluate(async () => window.grover.snapshot());
    if (state.managerFlights?.length === 1 && state.managerFlights[0].state === 'completed') break;
    const error = await page.locator('#home-composer .composer-error').textContent();
    if (error?.trim()) throw new Error(error.trim());
    await page.waitForTimeout(200);
  } while (Date.now() < greetingDeadline);
  assert.equal(state.managerFlights?.length, 1, 'packaged manager did not create a flight');
  const greetingFlight = state.managerFlights[0];
  const greetingStages = state.managerStages.filter((stage) => stage.flight_id === greetingFlight.id)
    .sort((left, right) => left.sequence - right.sequence);
  assert.deepEqual(greetingStages.map((stage) => stage.stage), ['route', 'continuity', 'retrieval', 'memory', 'respond']);
  assert.equal(state.memories.length, 0, 'packaged greeting polluted durable memory');
  const greetingMs = Date.now() - greetingStartedAt;

  const prompt = `Create a tiny coding project. Write a file named result.txt containing exactly ${expected}, verify the file, and report completion.`;
  const workerStartedAt = Date.now();
  await page.locator('#context-request').fill(prompt);
  await page.locator('#context-engine').selectOption('codex-cli');
  await page.locator('#context-request').press('Enter');
  const workerDeadline = Date.now() + 240_000;
  let answerMessage;
  do {
    state = await page.evaluate(async () => window.grover.snapshot());
    answerMessage = [...state.messages].reverse().find(
      (message) => message.role === 'assistant' && message.content.includes(expected),
    );
    if (answerMessage) break;
    const error = await page.locator('#context-composer .composer-error').textContent();
    if (error?.trim()) throw new Error(error.trim());
    await page.waitForTimeout(250);
  } while (Date.now() < workerDeadline);
  assert.ok(answerMessage, 'packaged Codex answer was not persisted');
  assert.ok(state.routing.some(
    (decision) => decision.task_id === answerMessage.task_id && decision.selected_engine === 'codex-cli',
  ), 'packaged request was not assigned to Codex');
  const workerFlight = state.managerFlights.find((flight) => flight.task_id === answerMessage.task_id);
  assert.equal(workerFlight?.state, 'completed', 'packaged worker flight did not reach completion');
  assert.ok(state.managerStages.some(
    (stage) => stage.flight_id === workerFlight.id && stage.stage === 'supervise',
  ), 'packaged Codex result was not supervised by the manager');
  const codingProject = state.projects.find((project) => project.conversation_id === answerMessage.conversation_id);
  assert.ok(codingProject?.root_path, 'packaged Coding request did not retain its project folder');
  assert.equal(
    readFileSync(join(codingProject.root_path, 'result.txt'), 'utf8'),
    expected,
    'packaged Codex task did not create the exact requested file content',
  );
  const codingMs = Date.now() - workerStartedAt;
  await page.screenshot({ path: join(resultDir, 'packaged-portable-functional.png'), fullPage: true });
  console.log(`Portable executable smoke passed: ${JSON.stringify({ executable, startup_ms: startupMs, greeting_ms: greetingMs, coding_ms: codingMs })}`);
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolveKill) => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolveKill()));
}

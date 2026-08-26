import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';

const appDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appDir, '..');
const dataDir = mkdtempSync(join(tmpdir(), 'grover-manager-authority-live-'));
const resultDir = join(appDir, 'test-results');
const screenshotPath = join(resultDir, 'manager-authority-live.png');
mkdirSync(resultDir, { recursive: true });

const application = await electron.launch({
  args: ['.'], cwd: appDir,
  env: {
    ...process.env,
    GROVER_TEST_DATA_DIR: dataDir,
    GROVER_TEST_WORKSPACE_ROOT: repoRoot,
    GROVER_TEST_MANAGER: 'true',
  },
});
const page = await application.firstWindow();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.waitForFunction(
    () => document.querySelector('#manager-status')?.textContent === 'Manager ready',
    null,
    { timeout: 180_000 },
  );
  const startup = await page.evaluate(async () => ({
    snapshot: (await window.grover.snapshot()).runtime.managerStatus,
    visibleText: document.querySelector('#manager-status')?.textContent,
  }));
  assert.equal(startup.snapshot.state, 'ready', `manager changed state: ${JSON.stringify(startup)}`);
  assert.equal(startup.visibleText, 'Manager ready', `visible manager state was ${JSON.stringify(startup)}`);

  const submitAndWait = async (selector, expectedFlights) => {
    const started = Date.now();
    await page.locator(selector).fill('Hello');
    await page.locator(selector).press('Enter');
    let current;
    const deadline = Date.now() + 240_000;
    do {
      current = await page.evaluate(async () => window.grover.snapshot());
      if (current.managerFlights?.length === expectedFlights && current.managerFlights[0].state === 'completed') break;
      const submitError = await page.locator(`${selector === '#home-request' ? '#home-composer' : '#context-composer'} .composer-error`).textContent();
      if (submitError?.trim()) throw new Error(`Manager submission failed: ${submitError.trim()}`);
      await page.waitForTimeout(100);
    } while (Date.now() < deadline);
    assert.equal(current.managerFlights?.length, expectedFlights, 'authoritative flight was not created before the timeout');
    assert.equal(current.managerFlights[0].state, 'completed', 'authoritative flight did not finish before the timeout');
    return { snapshot: current, elapsedMs: Date.now() - started };
  };

  const first = await submitAndWait('#home-request', 1);
  const snapshot = first.snapshot;
  assert.equal(snapshot.managerShadow.length, 0, 'authoritative requests must not write transitional shadow rows');
  assert.equal(snapshot.managerFlights.length, 1, 'one prompt should create one authoritative flight');
  const flight = snapshot.managerFlights[0];
  const stages = snapshot.managerStages
    .filter((stage) => stage.flight_id === flight.id)
    .sort((left, right) => left.sequence - right.sequence);
  const stageNames = stages.map((stage) => stage.stage);
  assert.deepEqual(stageNames.slice(0, 5), ['route', 'continuity', 'retrieval', 'memory', 'respond']);
  assert.ok(stages.every((stage) => stage.status === 'succeeded'), JSON.stringify(stages));
  assert.equal(flight.total_latency_ms, stages.reduce((total, stage) => total + stage.latency_ms, 0));
  const task = snapshot.tasks.find((item) => item.task_id === flight.task_id);
  assert.equal(task?.status, 'done', `manager-controlled greeting did not finish: ${JSON.stringify(task)}`);
  assert.equal(task?.domain, 'general');
  const assistant = snapshot.messages.find((message) => message.task_id === flight.task_id && message.role === 'assistant');
  assert.ok(assistant?.content, 'manager-controlled local answer was not rendered');
  assert.equal(snapshot.memories.length, 0, 'a greeting must not become a durable profile memory');
  assert.equal(snapshot.incidents.some((incident) => incident.kind === 'wrong_memory'), false,
    'a correctly ephemeral greeting should not create a false memory incident');
  await page.locator('#chat-messages').getByText(assistant.content, { exact: true }).waitFor();

  const warmed = await submitAndWait('#context-request', 2);
  const exactRepeat = await submitAndWait('#context-request', 3);
  const repeatFlight = exactRepeat.snapshot.managerFlights[0];
  const repeatStages = exactRepeat.snapshot.managerStages
    .filter((stage) => stage.flight_id === repeatFlight.id)
    .sort((left, right) => left.sequence - right.sequence);
  assert.deepEqual(repeatStages.map((stage) => stage.stage), ['route', 'continuity', 'retrieval', 'memory', 'respond']);
  assert.ok(repeatStages.every((stage) => stage.latency_ms === 0), JSON.stringify(repeatStages));
  const repeatAnswer = exactRepeat.snapshot.messages.find(
    (message) => message.task_id === repeatFlight.task_id && message.role === 'assistant',
  );
  assert.equal(repeatAnswer?.content, assistant.content, 'exact cache changed the validated manager answer');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert.deepEqual(errors, []);

  const measurement = {
    cold_end_to_end_ms: first.elapsedMs,
    recorded_total_ms: flight.total_latency_ms,
    stages: stages.map((stage) => ({ stage: stage.stage, latency_ms: stage.latency_ms })),
    warm_state_fill_ms: warmed.elapsedMs,
    exact_repeat_ms: exactRepeat.elapsedMs,
    exact_repeat_recorded_ms: repeatFlight.total_latency_ms,
    answer: assistant.content,
    model_hash: flight.model_hash,
    screenshot: screenshotPath,
  };
  console.log(`Authoritative manager smoke passed: ${JSON.stringify(measurement)}`);
} finally {
  await application.close();
}

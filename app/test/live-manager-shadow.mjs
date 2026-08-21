import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const appDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appDir, '..');
const dataDir = mkdtempSync(join(tmpdir(), 'grover-manager-live-'));
const resultDir = join(appDir, 'test-results');
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
  await page.waitForFunction(() => document.querySelector('#manager-status')?.textContent === 'Shadow ready', null, { timeout: 120_000 });
  await page.locator('[data-view="settings"]').click();
  const startup = await page.evaluate(async () => ({
    snapshot: (await window.grover.snapshot()).runtime.managerStatus,
    visibleText: document.querySelector('#manager-status')?.textContent,
  }));
  assert.equal(startup.snapshot.state, 'ready', `manager changed state: ${JSON.stringify(startup)}`);
  assert.equal(startup.visibleText, 'Shadow ready', `visible manager state was ${JSON.stringify(startup)}`);

  await page.locator('[data-view="home"]').click();
  const helloStarted = Date.now();
  await page.locator('#home-request').fill('hello');
  await page.locator('#home-request').press('Enter');
  await page.locator('#chat-messages').getByText('What would you like to do?', { exact: false }).waitFor();
  const helloVisible = Date.now() - helloStarted;
  let snapshot;
  const deadline = Date.now() + 15_000;
  do {
    snapshot = await page.evaluate(async () => window.grover.snapshot());
    if (snapshot.managerShadow.length === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(snapshot.managerShadow.length, 1, 'shadow decision was not recorded');
  assert.equal(snapshot.managerShadow[0].status, 'matched');
  assert.ok(helloVisible <= 1_000, `local greeting took ${helloVisible}ms to appear`);
  const task = snapshot.tasks.find((item) => item.task_id === snapshot.managerShadow[0].task_id);
  assert.equal(task.domain, 'general', 'shadow inference changed the deterministic route');

  await page.evaluate(async () => window.grover.setKillSwitch(true));
  const continuityStarted = Date.now();
  await page.locator('#context-request').fill("Let's code tictactoe");
  await page.locator('#context-request').press('Enter');
  await page.locator('#context-title').getByText('Coding', { exact: true }).waitFor();
  const branchVisible = Date.now() - continuityStarted;
  const continuityDeadline = Date.now() + 30_000;
  do {
    snapshot = await page.evaluate(async () => window.grover.snapshot());
    if (snapshot.managerShadow.length === 3) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < continuityDeadline);
  const continuityElapsed = Date.now() - continuityStarted;
  assert.equal(snapshot.managerShadow.length, 3, 'route plus continuity decisions were not recorded');
  const continuity = snapshot.managerShadow.find((item) => item.manager_task === 'continuity');
  assert.ok(continuity);
  assert.notEqual(continuity.status, 'failed');
  assert.ok(branchVisible <= 1_000, `deterministic branch took ${branchVisible}ms to appear`);
  const codingTask = snapshot.tasks.find((item) => item.task_id === continuity.task_id);
  assert.equal(codingTask.domain, 'coding', 'continuity shadow changed the deterministic branch');
  await page.screenshot({ path: join(resultDir, 'manager-shadow-live.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`Local greeting appeared in ${helloVisible}ms; Coding branch appeared in ${branchVisible}ms; background route plus continuity completed in ${continuityElapsed}ms; screenshot: ${join(resultDir, 'manager-shadow-live.png')}`);
} finally {
  await application.close();
}

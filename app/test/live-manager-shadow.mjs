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
  await page.locator('#home-request').fill('hello');
  await page.locator('#home-request').press('Enter');
  let snapshot;
  const deadline = Date.now() + 15_000;
  do {
    snapshot = await page.evaluate(async () => window.grover.snapshot());
    if (snapshot.managerShadow.length === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(snapshot.managerShadow.length, 1, 'shadow decision was not recorded');
  assert.equal(snapshot.managerShadow[0].status, 'matched');
  assert.ok(snapshot.managerShadow[0].latency_ms <= 3_000, `shadow route took ${snapshot.managerShadow[0].latency_ms}ms`);
  const task = snapshot.tasks.find((item) => item.task_id === snapshot.managerShadow[0].task_id);
  assert.equal(task.domain, 'general', 'shadow inference changed the deterministic route');
  await page.screenshot({ path: join(resultDir, 'manager-shadow-live.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`Native manager shadow passed in ${snapshot.managerShadow[0].latency_ms}ms; screenshot: ${join(resultDir, 'manager-shadow-live.png')}`);
} finally {
  await application.close();
}

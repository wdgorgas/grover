import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const appDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appDir, '..');
const dataDir = mkdtempSync(join(tmpdir(), 'grover-electron-'));
const resultDir = join(appDir, 'test-results');
mkdirSync(resultDir, { recursive: true });
const errors = [];

async function launch() {
  const application = await electron.launch({
    args: ['.'],
    cwd: appDir,
    env: {
      ...process.env,
      GROVER_TEST_DATA_DIR: dataDir,
      GROVER_TEST_WORKSPACE_ROOT: repoRoot,
    },
  });
  const page = await application.firstWindow();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForLoadState('domcontentloaded');
  return { application, page };
}

let first = await launch();
try {
  assert.equal(await first.page.title(), 'GROVER');
  assert.equal(await first.page.locator('h1').first().textContent(), 'What do you want to do?');
  await first.page.waitForFunction(() => !document.querySelector('#engine-status')?.textContent?.includes('Checking'));
  assert.match(await first.page.locator('#engine-status').textContent(), /Codex(?: \+ Claude)? installed/);
  assert.equal(await first.page.evaluate(() => typeof process), 'undefined', 'renderer has no Node process access');
  assert.equal(await first.page.evaluate(() => typeof require), 'undefined', 'renderer has no CommonJS access');
  const navigationStart = await first.page.evaluate(() => ({
    count: performance.getEntriesByType('navigation').length,
    origin: performance.timeOrigin,
  }));

  await first.page.locator('#request').fill('Remember that the Windows desktop app is the primary delivery target');
  await first.page.locator('#intent').selectOption('remember');
  await first.page.locator('#submit').click();
  await first.page.locator('[data-view="memory"]').click();
  await first.page.locator('#memory-list').getByText('the Windows desktop app is the primary delivery target', { exact: false }).waitFor();

  await first.page.locator('[data-view="command"]').click();
  await first.page.locator('#request').fill('Deploy the application publicly');
  await first.page.locator('#intent').selectOption('act');
  await first.page.locator('#submit').click();
  await first.page.locator('#all-tasks').getByText('External actions are not configured in this local build', { exact: true }).waitFor();

  await first.page.locator('#kill-switch').check();
  assert.equal(await first.page.locator('#kill-switch').isChecked(), true);
  await first.page.locator('#kill-switch').uncheck();

  const navigationEnd = await first.page.evaluate(() => ({
    count: performance.getEntriesByType('navigation').length,
    origin: performance.timeOrigin,
  }));
  assert.deepEqual(navigationEnd, navigationStart, 'interactions caused no document navigation');
  await first.page.screenshot({ path: join(resultDir, 'electron-smoke.png'), fullPage: true });
} finally {
  await first.application.close();
}

const second = await launch();
try {
  await second.page.locator('[data-view="memory"]').click();
  await second.page.locator('#memory-list').getByText('the Windows desktop app is the primary delivery target', { exact: false }).waitFor();
} finally {
  await second.application.close();
}

assert.deepEqual(errors, [], `unexpected renderer errors: ${errors.join('; ')}`);
console.log(`Electron smoke passed; screenshot: ${join(resultDir, 'electron-smoke.png')}`);

import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const appDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appDir, '..');
const packagedExecutable = process.env.GROVER_PACKAGED_EXE;
const dataDir = mkdtempSync(join(tmpdir(), 'grover-electron-'));
const resultDir = join(appDir, 'test-results');
mkdirSync(resultDir, { recursive: true });
const errors = [];

async function launch() {
  const application = await electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable, args: [] } : { args: ['.'] }),
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
  assert.equal(await first.page.locator('h1').first().textContent(), 'What are we working on?');
  await first.page.waitForFunction(() => !document.querySelector('#engine-status')?.textContent?.includes('Checking'));
  assert.match(await first.page.locator('#engine-status').textContent(), /Codex ready/);
  assert.equal(await first.page.evaluate(() => typeof process), 'undefined', 'renderer has no Node process access');
  assert.equal(await first.page.evaluate(() => typeof require), 'undefined', 'renderer has no CommonJS access');
  const navigationStart = await first.page.evaluate(() => ({
    count: performance.getEntriesByType('navigation').length,
    origin: performance.timeOrigin,
  }));

  await first.page.locator('#home-request').fill('Remember that the Windows desktop app is the primary delivery target');
  await first.page.locator('#home-request').press('Enter');
  await first.page.locator('[data-view="memory"]').click();
  await first.page.locator('#memory-list').getByText('the Windows desktop app is the primary delivery target', { exact: false }).waitFor();

  await first.page.locator('#kill-switch').check();
  await first.page.locator('[data-view="home"]').click();
  await first.page.locator('#home-request').fill('hi, my name is Will');
  await first.page.locator('#home-request').press('Enter');
  await first.page.locator('[data-view="memory"]').click();
  const proposedName = first.page.locator('#memory-proposals').getByText("Will's name is Will", { exact: false });
  await proposedName.waitFor();
  await proposedName.locator('xpath=ancestor::article').getByRole('button', { name: 'Remember' }).click();
  await first.page.locator('#memory-list').getByText("Will's name is Will", { exact: false }).waitFor();
  const greetingDomain = await first.page.evaluate(async () => {
    const state = await window.grover.snapshot();
    const message = state.messages.find((item) => item.role === 'user' && item.content === 'hi, my name is Will');
    return state.tasks.find((item) => item.task_id === message.task_id)?.domain;
  });
  assert.equal(greetingDomain, 'general', 'memory proposal changed the application context');
  await first.page.locator('#kill-switch').uncheck();

  await first.page.locator('[data-view="settings"]').click();
  assert.equal(await first.page.locator('#policy-rules .settings-card').count(), 5);
  await first.page.locator('#policy-rules').getByText('jackson private', { exact: true }).waitFor();
  await first.page.locator('#policy-rules').getByText('Always denied', { exact: true }).waitFor();

  await first.page.locator('[data-view="home"]').click();
  await first.page.locator('#home-request').fill('Deploy the application publicly');
  await first.page.locator('#home-request').press('Enter');
  await first.page.locator('#chat-messages').getByText('That requires an external action', { exact: false }).waitFor();
  await first.page.locator('#move-conversation').selectOption('business');
  await first.page.locator('#context-title').getByText('Business', { exact: true }).waitFor();

  await first.page.locator('[data-view="home"]').click();
  await first.page.locator('#home-request').fill('Line one');
  await first.page.locator('#home-request').press('Shift+Enter');
  assert.match(await first.page.locator('#home-request').inputValue(), /Line one\n/);
  await first.page.locator('#home-request').fill('');

  await first.page.locator('#kill-switch').check();
  assert.equal(await first.page.locator('#kill-switch').isChecked(), true);
  await first.page.locator('#kill-switch').uncheck();

  if (process.env.GROVER_LIVE_ENGINE === 'true') {
    await first.page.locator('[data-view="home"]').click();
    await first.page.locator('#home-request').fill('Reply with exactly: GROVER_PACKAGED_ENGINE_OK');
    await first.page.locator('#home-engine').selectOption('codex-cli');
    await first.page.locator('#home-request').press('Enter');
    const packagedResult = first.page.locator('#chat-messages').getByText('GROVER_PACKAGED_ENGINE_OK', { exact: false });
    await packagedResult.waitFor({ state: 'attached', timeout: 90_000 });
    assert.match(await packagedResult.textContent(), /GROVER_PACKAGED_ENGINE_OK/);
  }

  const navigationEnd = await first.page.evaluate(() => ({
    count: performance.getEntriesByType('navigation').length,
    origin: performance.timeOrigin,
  }));
  assert.deepEqual(navigationEnd, navigationStart, 'interactions caused no document navigation');
  await first.page.screenshot({
    path: join(resultDir, packagedExecutable ? 'packaged-electron-smoke.png' : 'electron-smoke.png'),
    fullPage: true,
  });
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
console.log(`Electron smoke passed; screenshot: ${join(resultDir, packagedExecutable ? 'packaged-electron-smoke.png' : 'electron-smoke.png')}`);

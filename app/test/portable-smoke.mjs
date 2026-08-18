import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const appDir = resolve(import.meta.dirname, '..');
const repoRoot = resolve(appDir, '..');
const executable = process.env.GROVER_PORTABLE_EXE ?? join(appDir, 'release', 'GROVER-2.0.0-rc.1-portable.exe');
const dataDir = mkdtempSync(join(tmpdir(), 'grover-portable-smoke-'));
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
  await page.locator('#home-request').fill('Reply with exactly: GROVER_PORTABLE_CODEX_OK');
  await page.locator('#home-engine').selectOption('codex-cli');
  await page.locator('#home-request').press('Enter');
  const answer = page.locator('#chat-messages').getByText('GROVER_PORTABLE_CODEX_OK', { exact: false });
  await answer.waitFor({ timeout: 90_000 });
  assert.match(await answer.textContent(), /GROVER_PORTABLE_CODEX_OK/);
  console.log('Portable executable smoke passed with live bundled Codex.');
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolveKill) => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolveKill()));
}

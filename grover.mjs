#!/usr/bin/env node
/**
 * GROVER launcher.
 *
 * Responsibilities:
 *  1. Verify the Node.js version can run the kernel (>= 22.5, for node:sqlite).
 *  2. Pick the right flags for this Node version (older 22.x needs
 *     --experimental-sqlite; newer versions don't).
 *  3. Boot the server as a child process with clean output.
 *
 * Zero dependencies, by design. See DECISIONS.md #2.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- 1. Version gate -------------------------------------------------------
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 5)) {
  console.error(
    `\n  GROVER needs Node.js 22.5 or newer (found ${process.versions.node}).\n` +
    `  Install the current LTS from https://nodejs.org and try again.\n`
  );
  process.exit(1);
}

// ---- 2. Feature-detect node:sqlite ----------------------------------------
const flags = [];
try {
  await import('node:sqlite');
} catch {
  // Older 22.x releases gate SQLite behind a flag. Newer ones don't.
  flags.push('--experimental-sqlite');
}
// Silence the "SQLite is experimental" warning where the option exists (>=21.3).
flags.push('--disable-warning=ExperimentalWarning');

// ---- 3. Boot the server ----------------------------------------------------
const serverPath = join(__dirname, 'server', 'index.mjs');
const child = spawn(
  process.execPath,
  [...flags, serverPath, ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env }
);
child.on('exit', (code) => process.exit(code ?? 0));

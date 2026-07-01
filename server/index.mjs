/**
 * GROVER server — HTTP entry point.
 *
 * Binds 127.0.0.1 by default (local-only). For server deployment behind
 * Cloudflare Tunnel + Access, see SECURITY.md before widening the bind.
 *
 * Identity resolution order:
 *   1. Cf-Access-Authenticated-User-Email header (Cloudflare Access)
 *   2. grover_user cookie (local profile picker)
 *   3. default → first user (Will)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { exec } from 'node:child_process';

import { ensureDirs, CLIENT_DIR, HOST, PORT, hasApiKey } from './config.mjs';
import { initDb, ensureUsers, one } from './db.mjs';
import { ensureVault } from './memory.mjs';
import { seedLedger } from './ledger.mjs';
import { seedSkills } from './skills.mjs';
import { ensureLoops } from './loops.mjs';
import { handleApi, json } from './api.mjs';

// ---- Boot -------------------------------------------------------------------
ensureDirs();
initDb();
ensureUsers();
ensureVault();
seedLedger();
seedSkills();
ensureLoops();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function resolveUser(req) {
  const cfEmail = req.headers['cf-access-authenticated-user-email'];
  if (cfEmail) {
    const byEmail = one(`SELECT id, name, email, role FROM users WHERE lower(email) = lower(?)`, cfEmail);
    if (byEmail) return byEmail;
  }
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter((p) => p.length === 2)
  );
  if (cookies.grover_user) {
    const byId = one(`SELECT id, name, email, role FROM users WHERE id = ?`, Number(cookies.grover_user));
    if (byId) return byId;
  }
  return one(`SELECT id, name, email, role FROM users ORDER BY id LIMIT 1`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-frame-options', 'DENY');

  try {
    if (url.pathname.startsWith('/api/')) {
      const user = resolveUser(req);
      if (!user) return json(res, 500, { error: 'No users provisioned' });
      const handled = await handleApi(req, res, user, url);
      if (!handled) json(res, 404, { error: 'Not found' });
      return;
    }

    let rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = normalize(join(CLIENT_DIR, rel));
    if (!filePath.startsWith(normalize(CLIENT_DIR) + sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!existsSync(filePath)) {
      const index = await readFile(join(CLIENT_DIR, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
      res.end(index);
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) json(res, 500, { error: 'Internal error' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  const addr = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log('');
  console.log('  ██████╗ ██████╗  ██████╗ ██╗   ██╗███████╗██████╗');
  console.log('  ██╔════╝ ██╔══██╗██╔═══██╗██║   ██║██╔════╝██╔══██╗');
  console.log('  ██║  ███╗██████╔╝██║   ██║██║   ██║█████╗  ██████╔╝');
  console.log('  ██║   ██║██╔══██╗██║   ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗');
  console.log('  ╚██████╔╝██║  ██║╚██████╔╝ ╚████╔╝ ███████╗██║  ██║');
  console.log('   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝');
  console.log('');
  console.log(`  General of Resource Optimization and Varying Expertise Requests`);
  console.log(`  Online at ${addr}  (bound to ${HOST})`);
  console.log(`  API key: ${hasApiKey() ? 'configured' : 'not set — add it in Settings'}`);
  console.log('');

  if (!process.env.GROVER_NO_OPEN && HOST === '127.0.0.1') {
    const cmd = process.platform === 'win32' ? `start "" "${addr}"`
      : process.platform === 'darwin' ? `open "${addr}"`
      : `xdg-open "${addr}"`;
    exec(cmd, () => { /* best-effort */ });
  }
});

/**
 * Configuration, paths, and secrets.
 *
 * Secrets live in data/secrets.json (gitignored, chmod 600 where supported).
 * Settings live in the database (see db.mjs) so they survive and sync.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ROOT = join(__dirname, '..');
export const DATA_DIR = join(ROOT, 'data');
export const VAULT_DIR = join(ROOT, 'vault');
export const CLIENT_DIR = join(ROOT, 'client');
export const DB_PATH = join(DATA_DIR, 'grover.db');
const SECRETS_PATH = join(DATA_DIR, 'secrets.json');

export const HOST = process.env.GROVER_HOST || '127.0.0.1';
export const PORT = Number(process.env.GROVER_PORT || 4370);

export function ensureDirs() {
  for (const d of [DATA_DIR, VAULT_DIR]) mkdirSync(d, { recursive: true });
}

// ---- Secrets ---------------------------------------------------------------

function readSecrets() {
  try {
    return JSON.parse(readFileSync(SECRETS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function getSecret(key) {
  // Env var wins (useful on the server); file otherwise.
  if (key === 'anthropicApiKey' && process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  return readSecrets()[key] || null;
}

export function setSecret(key, value) {
  const secrets = readSecrets();
  if (value === null || value === '') delete secrets[key];
  else secrets[key] = value;
  writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2), 'utf8');
  try { chmodSync(SECRETS_PATH, 0o600); } catch { /* Windows: ACLs apply instead */ }
}

export function hasApiKey() {
  return Boolean(getSecret('anthropicApiKey'));
}

export function maskedApiKey() {
  const k = getSecret('anthropicApiKey');
  if (!k) return null;
  return k.length > 12 ? `${k.slice(0, 10)}…${k.slice(-4)}` : '•••';
}

// ---- Default settings (stored in DB, editable in UI) -----------------------

export const DEFAULT_SETTINGS = {
  theme: 'default',           // default | arcane | spiderverse | light
  autonomyLevel: 1,           // 0..5, see AGENT_POLICY.md
  budgets: {
    dailyUsd: 5,
    monthlyUsd: 60,
  },
  // Capability tiers → provider model IDs. Abstract tiers, swappable models
  // underneath (master prompt §20). Verify IDs against docs.claude.com.
  models: {
    fast:     'claude-haiku-4-5',
    smart:    'claude-sonnet-5',
    frontier: 'claude-opus-4-8',
    fable:    'claude-fable-5',
  },
  // USD per million tokens. Editable — prices drift. (§11.4 reference pricing)
  pricing: {
    fast:     { in: 1,  out: 5  },
    smart:    { in: 2,  out: 10 },
    frontier: { in: 5,  out: 25 },
    fable:    { in: 10, out: 50 },
  },
  maxOutputTokens: {
    fast: 1024,
    smart: 2048,
    frontier: 4096,
    fable: 4096,
  },
};

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GroverCore } from '../src/core.ts';
import { openDb } from '../src/db.ts';
import {
  ManagerHttpClient, managerServerArgs, rawManagerPrompt, validateRouteDecision,
  type ManagerPlanner, type ManagerStatus, type RouteDecision,
} from '../src/manager.ts';

const route: RouteDecision = {
  schema_version: '1.0', task: 'route',
  decision: { destination: 'coding', work_kind: 'work', confidence: 'high', rationale_codes: ['software_creation'] },
};

test('manager server is loopback-only, authenticated outside argv, and has no browser surface', () => {
  const args = managerServerArgs('model.gguf', 18123, 2048);
  assert.deepEqual(args.slice(args.indexOf('--host'), args.indexOf('--host') + 2), ['--host', '127.0.0.1']);
  assert.deepEqual(args.slice(args.indexOf('--cors-origins'), args.indexOf('--cors-origins') + 2),
    ['--cors-origins', 'https://grover.invalid']);
  assert.ok(args.includes('--no-cors-credentials'));
  assert.ok(args.includes('--no-webui'));
  assert.ok(args.includes('--no-slots'));
  assert.ok(args.includes('--cache-ram') && args[args.indexOf('--cache-ram') + 1] === '0');
  assert.equal(args.some((arg) => /api.?key|bearer/i.test(arg)), false, 'API key must not appear in process arguments');
});

test('manager prompt preserves training format and deterministic key ordering', () => {
  const prompt = rawManagerPrompt('route', { request: 'Code a game', current_context: 'general', current_conversation_summary: 'Hello' });
  assert.match(prompt, /<\|im_start\|>system/);
  assert.match(prompt, /INPUT: \{"current_context":"general","current_conversation_summary":"Hello","request":"Code a game"\}/);
  assert.match(prompt, /<think>\n\n<\/think>\n\n$/);
});

test('route validation fails closed on malformed or expanded output', () => {
  assert.deepEqual(validateRouteDecision(route), route);
  assert.throws(() => validateRouteDecision({ ...route, extra: true }), /envelope/);
  assert.throws(() => validateRouteDecision({ ...route, decision: { ...route.decision, destination: 'internet' } }), /enum/);
  assert.throws(() => validateRouteDecision({ ...route, decision: { ...route.decision, rationale_codes: [] } }), /rationale/);
});

test('manager HTTP client authenticates backend requests and validates the response', async () => {
  const key = 'test-secret-key';
  let observedOrigin: string | undefined;
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${key}`);
    observedOrigin = request.headers.origin;
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      assert.match(JSON.parse(body).prompt, /TASK: route/);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ content: JSON.stringify(route) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const client = new ManagerHttpClient(`http://127.0.0.1:${address.port}`, key);
    const result = await client.inferRoute({ request: 'Code a game', current_context: 'general', current_conversation_summary: 'Hello' });
    assert.deepEqual(result.output, route);
    assert.equal(observedOrigin, undefined, 'backend request must not act like a browser origin');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('shadow manager records disagreement without changing the deterministic route', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-manager-shadow-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const status: ManagerStatus = { state: 'ready', detail: 'test', modelHash: 'TEST_HASH', lastLatencyMs: null };
  const manager: ManagerPlanner = {
    status: () => status,
    inferRoute: async () => ({ output: route, latencyMs: 12 }),
  };
  const core = new GroverCore({ db, dataDir, manager });
  const result = core.submit({ text: 'hello' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.context, 'general');
  const task = db.prepare('SELECT domain FROM task_state WHERE task_id = ?').get(result.taskId) as { domain: string };
  assert.equal(task.domain, 'general');
  const shadow = db.prepare(
    'SELECT status, model_hash, input_json, proposed_json FROM manager_shadow_decisions WHERE task_id = ?'
  ).get(result.taskId) as { status: string; model_hash: string; input_json: string; proposed_json: string };
  assert.equal(shadow.status, 'differed');
  assert.equal(shadow.model_hash, 'TEST_HASH');
  assert.equal(shadow.input_json.includes('hello'), false, 'shadow audit must not duplicate raw prompt text');
  assert.match(JSON.parse(shadow.input_json).request_sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(shadow.proposed_json).decision.destination, 'coding');
});

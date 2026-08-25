import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GroverCore } from '../src/core.ts';
import { openDb } from '../src/db.ts';
import { EngineRouter, type ExecutionEngine } from '../src/engine.ts';
import { addConversationMessage, createConversation, findConversationCandidates } from '../src/store.ts';
import {
  ManagerHttpClient, managerServerArgs, rawManagerPrompt, validateBriefDecision, validateClarifyDecision,
  validateContinuityDecision, validateExecutionDecision, validateMemoryDecision, validateRespondDecision,
  validateRetrievalDecision, validateRouteDecision, validateSuperviseDecision,
  type ContinuityDecision, type ManagerPlanner, type ManagerStatus, type RetrievalDecision, type RouteDecision,
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

test('continuity validation rejects invented conversation and project IDs', () => {
  const output: ContinuityDecision = {
    schema_version: '1.0', task: 'continuity',
    decision: {
      action: 'reopen', target_conversation_id: 'conv_known', target_project_id: 'proj_known', search_needed: false,
      confidence: 'high', rationale_codes: ['unique_existing_match'],
    },
  };
  const targets = new Map([['conv_known', 'proj_known']]);
  assert.deepEqual(validateContinuityDecision(output, targets), output);
  assert.throws(
    () => validateContinuityDecision(
      { ...output, decision: { ...output.decision, target_conversation_id: 'conv_invented' } },
      targets,
    ),
    /unavailable conversation/,
  );
  assert.throws(
    () => validateContinuityDecision(
      { ...output, decision: { ...output.decision, target_project_id: null } }, targets,
    ),
    /wrong project/,
  );
});

test('continuity candidate search stays bounded before model inference', () => {
  const db = openDb(':memory:');
  for (let index = 0; index < 12; index += 1) {
    const id = createConversation(db, 'coding', `Tictactoe variant ${index}`);
    addConversationMessage(db, id, null, 'user', `Update tictactoe variant ${index}`);
  }
  const candidates = findConversationCandidates(db, 'Update tictactoe', undefined, undefined, 100);
  assert.equal(candidates.length, 8);
  assert.equal(candidates.some((candidate) => 'content' in candidate), false);
});

test('retrieval validation rejects IDs outside the warm-start candidates', () => {
  const output: RetrievalDecision = {
    schema_version: '1.0', task: 'retrieval',
    decision: {
      conversation_ids: [], project_ids: [], memory_ids: ['mem_known'], search_queries: [], untrusted_ids: [],
      confidence: 'high', rationale_codes: ['global_profile_fact'],
    },
  };
  const allowed = {
    conversations: new Set<string>(), projects: new Set<string>(), memories: new Set(['mem_known']), untrusted: new Set<string>(),
  };
  assert.deepEqual(validateRetrievalDecision(output, allowed), output);
  assert.throws(
    () => validateRetrievalDecision(
      { ...output, decision: { ...output.decision, memory_ids: ['mem_invented'] } }, allowed,
    ),
    /unavailable memory_ids/,
  );
});

test('all trained manager lifecycle tasks validate only supplied application state', () => {
  const memoryInput = {
    project_id: 'proj_known', existing_memories: [{ id: 'mem_known', scope: 'project:proj_known', content: 'Old fact' }],
  };
  const memory = {
    schema_version: '1.0', task: 'memory', decision: {
      operation: 'update', target_memory_id: 'mem_known', scope: 'project:proj_known', canonical_fact: 'Verified fact',
      sensitivity: 'private', expires: false, confidence: 'high', rationale_codes: ['verified_project_fact'],
    },
  };
  assert.deepEqual(validateMemoryDecision(memory, memoryInput), memory);
  assert.throws(() => validateMemoryDecision({
    ...memory, decision: { ...memory.decision, target_memory_id: 'mem_invented' },
  }, memoryInput), /unavailable memory/);

  const executionInput = {
    tools: [{ id: 'project_files', available: true }], workers: [{ id: 'codex-cli', available: true }],
    workspaces: [{ id: 'proj_known', available: true }],
  };
  const execution = {
    schema_version: '1.0', task: 'execution', decision: {
      response_mode: 'delegate', tool_ids: ['project_files'], worker_id: 'codex-cli', tier: 'frontier',
      workspace_id: 'proj_known', permission_triggers: [], confidence: 'high', rationale_codes: ['project_work'],
    },
  };
  assert.deepEqual(validateExecutionDecision(execution, executionInput), execution);
  assert.throws(() => validateExecutionDecision({
    ...execution, decision: { ...execution.decision, worker_id: 'claude-unavailable' },
  }, executionInput), /unavailable worker/);

  const clarify = {
    schema_version: '1.0', task: 'clarify', decision: {
      needed: true, can_begin: false, question: 'Which project do you mean?', missing_fields: ['project'],
      confidence: 'high', rationale_codes: ['ambiguous_project'],
    },
  };
  assert.deepEqual(validateClarifyDecision(clarify), clarify);
  assert.throws(() => validateClarifyDecision({
    ...clarify, decision: { ...clarify.decision, question: null },
  }), /omitted its question/);

  const briefInput = { available_refs: [{ id: 'proj_known' }, { id: 'mem_known' }] };
  const brief = {
    schema_version: '1.0', task: 'brief', decision: {
      objective: 'Update the known project', context_refs: ['proj_known', 'mem_known'], constraints: ['stay local'],
      deliverables: ['working result'], verification: ['run tests'], stop_conditions: ['stop before deployment'],
    },
  };
  assert.deepEqual(validateBriefDecision(brief, briefInput), brief);
  assert.throws(() => validateBriefDecision({
    ...brief, decision: { ...brief.decision, context_refs: ['proj_invented'] },
  }, briefInput), /unavailable context/);

  const superviseInput = { workers: [{ id: 'codex-cli', available: true }] };
  const supervise = {
    schema_version: '1.0', task: 'supervise', decision: {
      action: 'accept', next_worker_id: null, missing_evidence: [], question: null,
      confidence: 'high', rationale_codes: ['required_evidence_present'],
    },
  };
  assert.deepEqual(validateSuperviseDecision(supervise, superviseInput), supervise);

  const respondInput = { tools: [{ id: 'memory_search', available: true }] };
  const respond = {
    schema_version: '1.0', task: 'respond', decision: {
      action: 'query_local', tool_ids: ['memory_search'], response: 'The saved value is available.',
      confidence: 'high', rationale_codes: ['authoritative_local_memory'],
    },
  };
  assert.deepEqual(validateRespondDecision(respond, respondInput), respond);
  assert.throws(() => validateRespondDecision({
    ...respond, decision: { ...respond.decision, tool_ids: ['invented_tool'] },
  }, respondInput), /unavailable tool/);
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
  const engine: ExecutionEngine = {
    id: 'test-engine', displayName: 'Test', capabilities: ['ask', 'work', 'project', 'build'], available: true,
    run: async () => ({ answer: 'done', costUsd: 0 }), cancel: () => false,
  };
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });
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

test('continuity shadow receives bounded candidates and cannot change reopen behavior', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-manager-continuity-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const coding = createConversation(db, 'coding', 'Tic tac toe game');
  addConversationMessage(db, coding, null, 'user', 'Build the tictactoe game board');
  let continuityInput: Record<string, unknown> | null = null;
  const manager: ManagerPlanner = {
    status: () => ({ state: 'ready', detail: 'test', modelHash: 'TEST_HASH', lastLatencyMs: null }),
    inferRoute: async () => ({
      output: {
        schema_version: '1.0', task: 'route',
        decision: { destination: 'coding', work_kind: 'work', confidence: 'high', rationale_codes: ['software_creation'] },
      },
      latencyMs: 8,
    }),
    inferContinuity: async (input) => {
      continuityInput = input;
      const candidates = input.candidate_conversations as { id: string; project_id: string | null }[];
      const current = input.current_conversation as { id: string } | null;
      const candidate = current ? candidates.find((item) => item.id === current.id)! : candidates[0];
      return {
        output: {
          schema_version: '1.0', task: 'continuity',
          decision: {
            action: current ? 'continue' : 'reopen', target_conversation_id: candidate.id, target_project_id: candidate.project_id,
            search_needed: false, confidence: 'high', rationale_codes: [current ? 'current_project_context' : 'unique_existing_match'],
          },
        },
        latencyMs: 9,
      };
    },
  };
  const engine: ExecutionEngine = {
    id: 'test-engine', displayName: 'Test', capabilities: ['ask', 'work', 'project', 'build'], available: true,
    run: async () => ({ answer: 'done', costUsd: 0 }), cancel: () => false,
  };
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });
  const result = core.submit({ text: 'Update tictactoe' });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const count = (db.prepare('SELECT COUNT(*) AS count FROM manager_shadow_decisions WHERE task_id = ?').get(result.taskId) as { count: number }).count;
    if (count === 2) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(result.conversationId, coding, 'deterministic continuity still owns the reopen');
  const candidates = continuityInput?.candidate_conversations as Record<string, unknown>[];
  assert.equal(candidates.length, 1);
  assert.deepEqual(Object.keys(candidates[0]).sort(), ['context', 'id', 'project_id', 'status', 'title']);
  const shadow = db.prepare(
    "SELECT status, deterministic_json, proposed_json FROM manager_shadow_decisions WHERE task_id = ? AND manager_task = 'continuity'"
  ).get(result.taskId) as { status: string; deterministic_json: string; proposed_json: string };
  assert.equal(shadow.status, 'matched', JSON.stringify({
    deterministic: JSON.parse(shadow.deterministic_json), proposed: JSON.parse(shadow.proposed_json),
  }));

  const followup = core.submit({ text: 'Go ahead', conversationId: coding, context: 'coding' });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const count = (db.prepare('SELECT COUNT(*) AS count FROM manager_shadow_decisions WHERE task_id = ?').get(followup.taskId) as { count: number }).count;
    if (count === 2) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(followup.conversationId, coding);
  const currentCandidates = continuityInput?.candidate_conversations as { id: string; project_id: string | null }[];
  assert.equal(currentCandidates.length, 1);
  assert.equal(currentCandidates[0].id, coding);
  assert.ok(currentCandidates[0].project_id, 'generic follow-up retained the current project ID');
  const followupShadow = db.prepare(
    "SELECT status FROM manager_shadow_decisions WHERE task_id = ? AND manager_task = 'continuity'"
  ).get(followup.taskId) as { status: string };
  assert.equal(followupShadow.status, 'matched');
});

test('retrieval shadow warm-starts bounded memory IDs without duplicating vault text in its audit', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-manager-retrieval-'));
  const db = openDb(join(dataDir, 'grover.db'));
  let retrievalInput: Record<string, unknown> | null = null;
  const manager: ManagerPlanner = {
    status: () => ({ state: 'ready', detail: 'test', modelHash: 'TEST_HASH', lastLatencyMs: null }),
    inferRoute: async () => ({
      output: {
        schema_version: '1.0', task: 'route',
        decision: { destination: 'general', work_kind: 'ask', confidence: 'high', rationale_codes: ['general_question'] },
      },
      latencyMs: 8,
    }),
    inferRetrieval: async (input) => {
      retrievalInput = input;
      const memory = ((input.candidates as Record<string, unknown>).memories as { id: string }[])[0];
      return {
        output: {
          schema_version: '1.0', task: 'retrieval',
          decision: {
            conversation_ids: [], project_ids: [], memory_ids: [memory.id], search_queries: [], untrusted_ids: [],
            confidence: 'high', rationale_codes: ['global_profile_fact'],
          },
        },
        latencyMs: 9,
      };
    },
  };
  const engine: ExecutionEngine = {
    id: 'test-engine', displayName: 'Test', capabilities: ['ask', 'work', 'project', 'build'], available: true,
    run: async () => ({ answer: 'done', costUsd: 0 }), cancel: () => false,
  };
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });
  const memoryId = core.memory.remember({
    content: 'Will prefers VS Code as an editor.', category: 'profile:preference', source: 'test',
  });
  const result = core.submit({ text: 'What is my preferred editor?' });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const count = (db.prepare('SELECT COUNT(*) AS count FROM manager_shadow_decisions WHERE task_id = ?').get(result.taskId) as { count: number }).count;
    if (count === 2) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  const candidates = (retrievalInput?.candidates as Record<string, unknown>).memories as { id: string; summary: string; scope: string }[];
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, memoryId);
  assert.match(candidates[0].summary, /VS Code/);
  assert.equal(candidates[0].scope, 'global');
  const shadow = db.prepare(
    "SELECT status, input_json FROM manager_shadow_decisions WHERE task_id = ? AND manager_task = 'retrieval'"
  ).get(result.taskId) as { status: string; input_json: string };
  assert.equal(shadow.status, 'matched');
  assert.equal(shadow.input_json.includes('VS Code'), false, 'audit stores candidate IDs, not vault text');
});

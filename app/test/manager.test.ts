import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GroverCore } from '../src/core.ts';
import { openDb } from '../src/db.ts';
import { EngineRouter, type ExecutionEngine } from '../src/engine.ts';
import { addConversationMessage, createConversation, findConversationCandidates } from '../src/store.ts';
import {
  compactManagerReferences, defaultManagerRuntimeRoot, MANAGER_OUTPUT_TOKEN_CAPS, ManagerHttpClient, managerServerArgs,
  rawManagerPrompt,
  validateBriefDecision, validateClarifyDecision,
  validateContinuityDecision, validateExecutionDecision, validateMemoryDecision, validateRespondDecision,
  validateRetrievalDecision, validateRouteDecision, validateSuperviseDecision,
  type ContinuityDecision, type ManagerPlanner, type ManagerStatus, type RetrievalDecision, type RouteDecision,
} from '../src/manager.ts';

const route: RouteDecision = {
  schema_version: '1.0', task: 'route',
  decision: { destination: 'coding', work_kind: 'work', confidence: 'high', rationale_codes: ['software_creation'] },
};

async function waitForTaskStatus(db: ReturnType<typeof openDb>, taskId: string, expected: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const task = db.prepare('SELECT status FROM task_state WHERE task_id = ?').get(taskId) as { status: string } | undefined;
    if (task?.status === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const task = db.prepare('SELECT status, plain_language FROM task_state WHERE task_id = ?').get(taskId);
  assert.fail(`Task ${taskId} did not reach ${expected}: ${JSON.stringify(task)}`);
}

function codingManager(options: {
  routeInputs?: Record<string, unknown>[];
  superviseInputs?: Record<string, unknown>[];
  supervise?: (call: number) => 'accept' | 'clarify';
} = {}): ManagerPlanner {
  let supervisionCalls = 0;
  return {
    status: () => ({ state: 'ready', detail: 'test', modelHash: 'TEST_HASH', lastLatencyMs: null }),
    inferRoute: async (input) => {
      options.routeInputs?.push(input);
      return { output: route, latencyMs: 1 };
    },
    inferContinuity: async (input) => {
      const current = input.current_conversation as { id: string; project_id?: string | null } | null;
      const candidates = input.candidate_conversations as { id: string; project_id: string | null }[];
      const target = current ?? candidates[0];
      return {
        output: {
          schema_version: '1.0', task: 'continuity', decision: {
            action: current ? 'continue' : 'reopen', target_conversation_id: target.id,
            target_project_id: target.project_id ?? null, search_needed: false, confidence: 'high',
            rationale_codes: ['known_project'],
          },
        }, latencyMs: 1,
      };
    },
    inferRetrieval: async (input) => {
      const candidates = input.candidates as Record<string, { id: string }[]>;
      return {
        output: {
          schema_version: '1.0', task: 'retrieval', decision: {
            conversation_ids: candidates.conversations.slice(0, 1).map((item) => item.id),
            project_ids: candidates.projects.slice(0, 1).map((item) => item.id),
            memory_ids: candidates.memories.map((item) => item.id), search_queries: [], untrusted_ids: [],
            confidence: 'high', rationale_codes: ['known_project'],
          },
        }, latencyMs: 1,
      };
    },
    inferMemory: async () => ({
      output: {
        schema_version: '1.0', task: 'memory', decision: {
          operation: 'none', target_memory_id: null, scope: null, canonical_fact: null, sensitivity: null,
          expires: false, confidence: 'high', rationale_codes: ['no_new_memory'],
        },
      }, latencyMs: 1,
    }),
    inferRespond: async () => ({
      output: {
        schema_version: '1.0', task: 'respond', decision: {
          action: 'delegate', tool_ids: [], response: null, confidence: 'high', rationale_codes: ['worker_needed'],
        },
      }, latencyMs: 1,
    }),
    inferClarify: async () => ({
      output: {
        schema_version: '1.0', task: 'clarify', decision: {
          needed: false, can_begin: true, question: null, missing_fields: [], confidence: 'high',
          rationale_codes: ['safe_discovery_can_begin'],
        },
      }, latencyMs: 1,
    }),
    inferExecution: async () => ({
      output: {
        schema_version: '1.0', task: 'execution', decision: {
          response_mode: 'delegate', tool_ids: ['project_files'], worker_id: 'worker_frontier', tier: 'frontier',
          workspace_id: 'workspace_project', permission_triggers: [], confidence: 'high',
          rationale_codes: ['project_write_worker'],
        },
      }, latencyMs: 1,
    }),
    inferBrief: async (input) => ({
      output: {
        schema_version: '1.0', task: 'brief', decision: {
          objective: 'Continue the existing Coding project',
          context_refs: (input.available_refs as { id: string }[]).map((item) => item.id),
          constraints: ['inspect existing context first'], deliverables: ['working files'],
          verification: ['check the changed file'], stop_conditions: ['stop before deployment'],
        },
      }, latencyMs: 1,
    }),
    inferSupervise: async (input) => {
      options.superviseInputs?.push(input);
      const action = options.supervise?.(supervisionCalls++) ?? 'accept';
      return {
        output: {
          schema_version: '1.0', task: 'supervise', decision: {
            action, next_worker_id: null, missing_evidence: [],
            question: action === 'clarify' ? 'Which local folder should I use?' : null,
            confidence: 'high', rationale_codes: [action === 'clarify' ? 'location_needed' : 'verified_result'],
          },
        }, latencyMs: 1,
      };
    },
  };
}

test('manager server is loopback-only, authenticated outside argv, and has no browser surface', () => {
  const args = managerServerArgs('model.gguf', 18123, 2048);
  assert.deepEqual(args.slice(args.indexOf('--host'), args.indexOf('--host') + 2), ['--host', '127.0.0.1']);
  assert.deepEqual(args.slice(args.indexOf('--cors-origins'), args.indexOf('--cors-origins') + 2),
    ['--cors-origins', 'https://grover.invalid']);
  assert.ok(args.includes('--no-cors-credentials'));
  assert.ok(args.includes('--no-webui'));
  assert.ok(args.includes('--no-slots'));
  assert.equal(args.includes('--cache-prompt'), false, 'cross-contract slot prefix state must not be reused');
  assert.ok(args.includes('--cache-ram') && args[args.indexOf('--cache-ram') + 1] === '0');
  assert.equal(args.some((arg) => /api.?key|bearer/i.test(arg)), false, 'API key must not appear in process arguments');
});

test('packaged manager resources take precedence over machine-local inference files', () => {
  const resources = mkdtempSync(join(tmpdir(), 'grover-packaged-manager-root-'));
  const bundled = join(resources, 'manager-inference');
  mkdirSync(bundled);
  writeFileSync(join(bundled, 'inference_manifest.json'), '{}');
  assert.equal(defaultManagerRuntimeRoot(resources), bundled);
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
  const targetlessWithoutProject = {
    schema_version: '1.0', task: 'continuity',
    decision: {
      action: 'start_new', target_conversation_id: null, search_needed: false,
      confidence: 'high', rationale_codes: ['new_conversation'],
    },
  };
  const normalizedTargetless = validateContinuityDecision(targetlessWithoutProject, new Map());
  assert.equal(normalizedTargetless.decision.action, 'create');
  assert.equal(normalizedTargetless.decision.target_project_id, null);
  const { target_project_id: _omitted, ...missingProjectTarget } = output.decision;
  assert.throws(() => validateContinuityDecision({
    ...output, decision: missingProjectTarget,
  }, targets), /missing or unexpected/);
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

test('production UUID references are losslessly compacted without rewriting user text', () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const projectId = '22222222-2222-4222-8222-222222222222';
  const memoryId = '33333333-3333-4333-8333-333333333333';
  const request = `Discuss ${conversationId} literally without rewriting it.`;
  const prepared = compactManagerReferences('retrieval', {
    request,
    context: 'coding',
    candidates: {
      conversations: [{ id: conversationId, title: 'Known project', context: 'coding', trusted: true }],
      projects: [{ id: projectId, name: 'Known project', context: 'coding', trusted: true }],
      memories: [{ id: memoryId, scope: `project:${projectId}`, summary: 'Known goal', trusted: true }],
    },
  });
  assert.equal(prepared.input.request, request, 'ordinary user text must not be rewritten');
  const candidates = prepared.input.candidates as Record<string, { id: string; scope?: string }[]>;
  assert.equal(candidates.conversations[0].id, 'c1');
  assert.equal(candidates.projects[0].id, 'p1');
  assert.equal(candidates.memories[0].id, 'm1');
  assert.equal(candidates.memories[0].scope, 'project:p1');
  const restored = prepared.restore({
    schema_version: '1.0', task: 'retrieval', decision: {
      conversation_ids: ['c1'], project_ids: ['p1'], memory_ids: ['m1'], search_queries: [], untrusted_ids: [],
      confidence: 'high', rationale_codes: ['known_project'],
    },
  }) as RetrievalDecision;
  assert.deepEqual(restored.decision.conversation_ids, [conversationId]);
  assert.deepEqual(restored.decision.project_ids, [projectId]);
  assert.deepEqual(restored.decision.memory_ids, [memoryId]);
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
  assert.throws(() => validateSuperviseDecision({
    ...supervise,
    decision: { ...supervise.decision, action: 'verify', next_worker_id: 'codex-cli', missing_evidence: [] },
  }, superviseInput), /without naming missing evidence/);
  assert.throws(() => validateSuperviseDecision({
    ...supervise,
    decision: { ...supervise.decision, action: 'verify', next_worker_id: 'codex-cli', missing_evidence: ['changed_files'] },
  }, { ...superviseInput, evidence: [{ kind: 'changed_files' }] }), /already supplied/);

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
  let requestCount = 0;
  const server = createServer((request, response) => {
    requestCount += 1;
    assert.equal(request.headers.authorization, `Bearer ${key}`);
    observedOrigin = request.headers.origin;
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const parsed = JSON.parse(body);
      assert.match(parsed.prompt, /TASK: route/);
      assert.equal(parsed.json_schema, undefined);
      assert.equal(parsed.n_predict, MANAGER_OUTPUT_TOKEN_CAPS.route);
      assert.equal(parsed.cache_prompt, false);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ content: JSON.stringify(route) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const client = new ManagerHttpClient(`http://127.0.0.1:${address.port}`, key);
    const input = { request: 'Code a game', current_context: 'general', current_conversation_summary: 'Hello' };
    const result = await client.inferRoute(input);
    assert.deepEqual(result.output, route);
    assert.equal(result.cacheHit, false);
    const repeated = await client.inferRoute(input);
    assert.deepEqual(repeated.output, route);
    assert.equal(repeated.cacheHit, true);
    assert.equal(repeated.latencyMs, 0);
    assert.equal(requestCount, 1, 'exact validated input reuses the bounded in-memory result');
    assert.equal(observedOrigin, undefined, 'backend request must not act like a browser origin');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('manager client makes one bounded semantic repair after an invalid contract decision', async () => {
  const key = 'repair-key';
  const prompts: string[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const prompt = JSON.parse(body).prompt as string;
      prompts.push(prompt);
      const repaired = prompt.includes('manager_validation_repair');
      const output = repaired ? {
        schema_version: '1.0', task: 'continuity', decision: {
          action: 'reopen', target_conversation_id: 'conv_known', target_project_id: 'proj_known',
          search_needed: false, confidence: 'high', rationale_codes: ['repaired_existing_match'],
        },
      } : {
        schema_version: '1.0', task: 'continuity', decision: {
          action: 'answer_local', target_conversation_id: 'conv_known', target_project_id: 'proj_known',
          search_needed: false, confidence: 'high', rationale_codes: ['wrong_contract'],
        },
      };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ content: JSON.stringify(output) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const client = new ManagerHttpClient(`http://127.0.0.1:${address.port}`, key);
    const result = await client.inferContinuity({
      request: 'Continue the pending project request using my answer.', resolved_destination: 'coding',
      current_conversation: { id: 'conv_known', title: 'Known', context: 'coding', project_id: 'proj_known' },
      candidate_conversations: [
        { id: 'conv_known', title: 'Known', context: 'coding', project_id: 'proj_known', status: 'active' },
      ],
    });
    assert.equal(prompts.length, 2);
    assert.equal(result.output.decision.action, 'reopen');
    assert.equal(result.recovery?.attempted, true);
    assert.match(result.recovery?.validationError ?? '', /unknown enum value/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('manager client makes the same bounded repair when the first output is invalid JSON', async () => {
  let calls = 0;
  const server = createServer((request, response) => {
    calls += 1;
    request.resume();
    request.on('end', () => {
      const content = calls === 1 ? '{broken json' : JSON.stringify(route);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ content, timings: { predicted_ms: 2 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const client = new ManagerHttpClient(`http://127.0.0.1:${address.port}`, 'secret');
    const result = await client.inferRoute({ request: 'code a game', current_context: 'general' });
    assert.deepEqual(result.output, route);
    assert.equal(result.recovery?.attempted, true);
    assert.match(result.recovery?.validationError ?? '', /invalid JSON/);
    assert.equal(calls, 2);
  } finally {
    server.close();
  }
});

test('manager client repairs selection of an unavailable tool without enabling it', async () => {
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const prompt = (JSON.parse(body).prompt as string);
      const repaired = prompt.includes('manager_validation_repair');
      const output = {
        schema_version: '1.0', task: 'execution', decision: repaired ? {
          response_mode: 'blocked', tool_ids: [], worker_id: null, tier: 'local', workspace_id: null,
          permission_triggers: [], confidence: 'high', rationale_codes: ['unavailable_tool_blocked'],
        } : {
          response_mode: 'local', tool_ids: ['calendar_read'], worker_id: null, tier: 'local', workspace_id: null,
          permission_triggers: [], confidence: 'high', rationale_codes: ['calendar_action'],
        },
      };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ content: JSON.stringify(output) }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    const client = new ManagerHttpClient(`http://127.0.0.1:${address.port}`, 'repair-key');
    const result = await client.inferExecution({
      goal: 'Set my daily schedule', context: 'general', project_id: null,
      tools: [{ id: 'calendar_read', available: false, authority: 'read' }],
      workers: [], workspaces: [], permissions: {},
    });
    assert.equal(result.output.decision.response_mode, 'blocked');
    assert.deepEqual(result.output.decision.tool_ids, []);
    assert.equal(result.recovery?.attempted, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('an unrepaired manager failure remains visible as a linked retryable task', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-managed-visible-failure-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const conversationId = createConversation(db, 'coding', 'Visible manager failure');
  const manager = codingManager();
  manager.inferRoute = async () => { throw new Error('route schema remained invalid'); };
  const core = new GroverCore({ db, dataDir, manager });

  const result = await core.submitManaged({
    text: 'Continue the existing project.', context: 'coding', conversationId,
  });
  await waitForTaskStatus(db, result.taskId, 'failed');
  const incident = db.prepare('SELECT id, task_id FROM incidents ORDER BY last_seen_at DESC LIMIT 1').get() as
    { id: string; task_id: string };
  assert.equal(incident.task_id, result.taskId);
  const answer = db.prepare(
    "SELECT content FROM conversation_messages WHERE task_id = ? AND role = 'assistant'"
  ).get(result.taskId) as { content: string };
  assert.match(answer.content, new RegExp(incident.id));
  assert.match(answer.content, /retry/i);
});

test('managed conversational navigation stops after continuity without tools or project creation', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-managed-navigation-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const conversationId = createConversation(db, 'coding', 'Guess and check game');
  addConversationMessage(db, conversationId, null, 'user', 'Build a guess and check game.');
  let downstreamCalls = 0;
  let engineCalls = 0;
  const manager: ManagerPlanner = {
    status: () => ({ state: 'ready', detail: 'test', modelHash: 'TEST_HASH', lastLatencyMs: null }),
    inferRoute: async () => ({ output: route, latencyMs: 1 }),
    inferContinuity: async (input) => {
      const target = (input.candidate_conversations as { id: string; project_id: string | null }[])[0];
      return {
        output: {
          schema_version: '1.0', task: 'continuity', decision: {
            action: 'reopen', target_conversation_id: target.id, target_project_id: target.project_id,
            search_needed: false, confidence: 'high', rationale_codes: ['unique_existing_match'],
          },
        }, latencyMs: 1,
      };
    },
    inferRetrieval: async () => { downstreamCalls += 1; throw new Error('retrieval should not run'); },
    inferMemory: async () => { downstreamCalls += 1; throw new Error('memory should not run'); },
    inferRespond: async () => { downstreamCalls += 1; throw new Error('respond should not run'); },
    inferClarify: async () => { downstreamCalls += 1; throw new Error('clarify should not run'); },
    inferExecution: async () => { downstreamCalls += 1; throw new Error('execution should not run'); },
    inferBrief: async () => { downstreamCalls += 1; throw new Error('brief should not run'); },
    inferSupervise: async () => { downstreamCalls += 1; throw new Error('supervise should not run'); },
  };
  const engine: ExecutionEngine = {
    id: 'codex-cli', displayName: 'Codex', capabilities: ['ask', 'work', 'project'], available: true,
    run: async () => { engineCalls += 1; return { answer: 'unexpected', costUsd: 0 }; }, cancel: () => false,
  };
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });
  const before = (db.prepare('SELECT COUNT(*) AS count FROM conversation_messages WHERE conversation_id = ?')
    .get(conversationId) as { count: number }).count;
  const result = await core.submitManaged({ text: 'hey grover can you open up the guess and check project' });
  assert.equal(result.conversationId, conversationId);
  assert.equal(result.conversationDisposition, 'navigated');
  assert.equal(downstreamCalls, 0);
  assert.equal(engineCalls, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM project_records').get() as { count: number }).count, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM conversation_messages WHERE conversation_id = ?')
    .get(conversationId) as { count: number }).count, before, 'navigation did not pollute project history');
  assert.deepEqual(
    (db.prepare('SELECT stage FROM manager_stage_records ORDER BY sequence').all() as { stage: string }[])
      .map((row) => row.stage),
    ['route', 'continuity'],
  );
});

test('continuity gets one manager-led semantic review before duplicating a warm-started project', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-managed-continuity-review-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const conversationId = createConversation(db, 'coding', 'Guess and check game');
  addConversationMessage(db, conversationId, null, 'user', 'Build a guess and check game for numbers 1-10.');
  let continuityCalls = 0;
  const manager = codingManager();
  manager.inferContinuity = async (input) => {
    continuityCalls += 1;
    const candidates = input.candidate_conversations as { id: string; project_id: string | null }[];
    const reviewed = Boolean(input.continuity_review);
    return {
      output: {
        schema_version: '1.0', task: 'continuity', decision: {
          action: reviewed ? 'reopen' : 'branch',
          target_conversation_id: reviewed ? candidates[0].id : null,
          target_project_id: reviewed ? candidates[0].project_id : null,
          search_needed: false, confidence: 'high',
          rationale_codes: [reviewed ? 'existing_project_update' : 'new_scope'],
        },
      }, latencyMs: 1,
    };
  };
  const engine = {
    id: 'codex-cli', displayName: 'Codex', capabilities: ['ask', 'work', 'project'], available: true,
    run: async () => ({ answer: 'Updated existing project.', costUsd: 0 }), cancel: () => false,
  } as ExecutionEngine;
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });

  const result = await core.submitManaged({ text: 'Expand the guess and check game to numbers 1-15.' });
  await waitForTaskStatus(db, result.taskId, 'done');
  assert.equal(result.conversationId, conversationId);
  assert.equal(continuityCalls, 2);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM conversations').get() as { count: number }).count, 1);
  const refs = db.prepare(
    `SELECT s.input_refs_json FROM manager_stage_records s JOIN manager_flights f ON f.id = s.flight_id
     WHERE f.task_id = ? AND s.stage = 'continuity'`
  ).get(result.taskId) as { input_refs_json: string };
  assert.equal(JSON.parse(refs.input_refs_json).semantic_review_attempted, true);
});

test('an explicit manager decision to create a separate project bypasses continuity review', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-managed-explicit-new-'));
  const db = openDb(join(dataDir, 'grover.db'));
  createConversation(db, 'coding', 'Guess and check game');
  let continuityCalls = 0;
  const manager = codingManager();
  manager.inferContinuity = async () => {
    continuityCalls += 1;
    return {
      output: {
        schema_version: '1.0', task: 'continuity', decision: {
          action: 'branch', target_conversation_id: null, target_project_id: null,
          search_needed: false, confidence: 'high', rationale_codes: ['explicit_new_project'],
        },
      }, latencyMs: 1,
    };
  };
  const engine = {
    id: 'codex-cli', displayName: 'Codex', capabilities: ['ask', 'work', 'project'], available: true,
    run: async () => ({ answer: 'Created the separate project.', costUsd: 0 }), cancel: () => false,
  } as ExecutionEngine;
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });

  const result = await core.submitManaged({ text: 'Create a separate new Guess and check game project.' });
  await waitForTaskStatus(db, result.taskId, 'done');
  assert.equal(continuityCalls, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM conversations').get() as { count: number }).count, 2);
});

test('manager project_files authority materializes and edits a legacy Coding project', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-managed-legacy-project-'));
  const projectsRoot = join(dataDir, 'projects');
  const db = openDb(join(dataDir, 'grover.db'));
  const conversationId = createConversation(db, 'coding', 'Guess and check game');
  const original = 'Build a Python guess and check game for numbers 1-10.';
  addConversationMessage(db, conversationId, null, 'user', original);
  addConversationMessage(db, conversationId, null, 'assistant', 'Use random.randint(1, 10).');
  const engine: ExecutionEngine = {
    id: 'codex-cli', displayName: 'Codex', capabilities: ['ask', 'work', 'project'], available: true,
    run: async (input) => {
      writeFileSync(join(input.cwd, 'guess_game.py'), 'MAX_NUMBER = 15\n', 'utf8');
      return { answer: 'Updated guess_game.py to use numbers 1-15 and verified the file.', costUsd: 0 };
    }, cancel: () => false,
  };
  const superviseInputs: Record<string, unknown>[] = [];
  const core = new GroverCore({
    db, dataDir, projectsRoot, manager: codingManager({ superviseInputs }), router: new EngineRouter([engine]),
  });
  const result = await core.submitManaged({ text: 'Broaden the guess and check range to numbers 1-15.' });
  await waitForTaskStatus(db, result.taskId, 'done');
  const project = db.prepare('SELECT root_path FROM projects WHERE conversation_id = ?').get(conversationId) as
    { root_path: string };
  assert.equal(readFileSync(join(project.root_path, 'guess_game.py'), 'utf8'), 'MAX_NUMBER = 15\n');
  assert.ok((superviseInputs[0].evidence as { kind: string }[]).some((item) => item.kind === 'changed_files'));
  const projectRecord = db.prepare('SELECT goal FROM project_records WHERE conversation_id = ?').get(conversationId) as
    { goal: string };
  assert.equal(projectRecord.goal, original, 'legacy project identity comes from its original request, not the update prompt');
});

test('manager verifier remains non-interactive when an execution runtime is unavailable', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-managed-noninteractive-verifier-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const conversationId = createConversation(db, 'coding', 'Guess and check game');
  addConversationMessage(db, conversationId, null, 'user', 'Build a Python guess and check game for numbers 1-10.');
  const manager = codingManager();
  let supervisionCalls = 0;
  manager.inferSupervise = async () => {
    const verify = supervisionCalls++ === 0;
    return {
      output: {
        schema_version: '1.0', task: 'supervise', decision: {
          action: verify ? 'verify' : 'accept', next_worker_id: verify ? 'worker_frontier' : null,
          missing_evidence: verify ? ['verification'] : [], question: null, confidence: 'high',
          rationale_codes: [verify ? 'verification_needed' : 'verified_result'],
        },
      }, latencyMs: 1,
    };
  };
  const workerPrompts: string[] = [];
  const engine: ExecutionEngine = {
    id: 'codex-cli', displayName: 'Codex', capabilities: ['ask', 'work', 'project'], available: true,
    run: async (input) => {
      workerPrompts.push(input.prompt);
      if (workerPrompts.length === 1) {
        writeFileSync(join(input.cwd, 'guess_game.py'), 'MAX_NUMBER = 15\n', 'utf8');
        return { answer: 'Updated the range. Python is unavailable, so runtime verification was not possible.', costUsd: 0 };
      }
      assert.match(input.prompt, /This is a non-interactive worker run\. Never invoke interactive input\./);
      assert.match(input.prompt, /perform the strongest safe static checks available/);
      return { answer: 'Static inspection confirms guess_game.py contains MAX_NUMBER = 15.', costUsd: 0 };
    }, cancel: () => false,
  };
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });
  const result = await core.submitManaged({
    text: 'Expand the game from numbers 1-10 to 1-15.', context: 'coding', conversationId,
  });
  await waitForTaskStatus(db, result.taskId, 'done');
  assert.equal(workerPrompts.length, 2);
  db.close();
});

test('clarification answer resumes the blocked project request instead of becoming a standalone answer', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-managed-clarification-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const conversationId = createConversation(db, 'coding', 'Guess and check game');
  addConversationMessage(db, conversationId, null, 'user', 'Build a Python guess and check game.');
  const routeInputs: Record<string, unknown>[] = [];
  const manager = codingManager({ routeInputs, supervise: (call) => call === 0 ? 'clarify' : 'accept' });
  const workerPrompts: string[] = [];
  const engine: ExecutionEngine = {
    id: 'codex-cli', displayName: 'Codex', capabilities: ['ask', 'work', 'project'], available: true,
    run: async (input) => {
      workerPrompts.push(input.prompt);
      writeFileSync(join(input.cwd, 'guess_game.py'), 'MAX_NUMBER = 15\n', 'utf8');
      return { answer: 'Prepared the project files.', costUsd: 0 };
    }, cancel: () => false,
  };
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });
  const first = await core.submitManaged({
    text: 'Expand the game from numbers 1-10 to 1-15.', context: 'coding', conversationId,
  });
  await waitForTaskStatus(db, first.taskId, 'blocked');
  const second = await core.submitManaged({
    text: 'C drive is alright, or just whatever local directory you have',
    context: 'coding', conversationId,
  });
  await waitForTaskStatus(db, second.taskId, 'done');
  assert.match(String(routeInputs.at(-1)?.request), /Original request: Expand the game from numbers 1-10 to 1-15\./);
  assert.match(String(routeInputs.at(-1)?.request), /Will's answer: C drive is alright/);
  assert.match(workerPrompts.at(-1) ?? '', /Will's answer: C drive is alright/);
  assert.match(workerPrompts.at(-1) ?? '', /Do not scaffold a new framework/);
  const displayed = db.prepare(
    "SELECT content FROM conversation_messages WHERE task_id = ? AND role = 'user'"
  ).get(second.taskId) as { content: string };
  assert.equal(displayed.content, 'C drive is alright, or just whatever local directory you have');
  assert.equal((db.prepare('SELECT status FROM task_state WHERE task_id = ?').get(first.taskId) as { status: string }).status, 'cancelled');
});

test('manager-classified Lifestyle schedule writes complete locally without calendar sync', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-managed-local-schedule-'));
  const db = openDb(join(dataDir, 'grover.db'));
  let engineCalls = 0;
  const manager: ManagerPlanner = {
    status: () => ({ state: 'ready', detail: 'test', modelHash: 'TEST_HASH', lastLatencyMs: null }),
    inferRoute: async () => ({
      output: {
        schema_version: '1.0', task: 'route', decision: {
          destination: 'lifestyle', work_kind: 'act', confidence: 'high', rationale_codes: ['calendar_action'],
        },
      }, latencyMs: 1,
    }),
    inferContinuity: async () => ({
      output: {
        schema_version: '1.0', task: 'continuity', decision: {
          action: 'create', target_conversation_id: null, target_project_id: null, search_needed: false,
          confidence: 'high', rationale_codes: ['new_schedule'],
        },
      }, latencyMs: 1,
    }),
    inferRetrieval: async () => ({
      output: {
        schema_version: '1.0', task: 'retrieval', decision: {
          conversation_ids: [], project_ids: [], memory_ids: [], search_queries: [], untrusted_ids: [],
          confidence: 'high', rationale_codes: ['no_prior_schedule'],
        },
      }, latencyMs: 1,
    }),
    inferMemory: async () => ({
      output: {
        schema_version: '1.0', task: 'memory', decision: {
          operation: 'create', target_memory_id: null, scope: 'context:lifestyle',
          canonical_fact: 'Daily schedule: gym 9-11, school 12-1 and 4-6, research 1-4, capstone 6-8.',
          sensitivity: 'private', expires: false, confidence: 'high', rationale_codes: ['durable_schedule'],
        },
      }, latencyMs: 1,
    }),
    inferRespond: async () => ({
      output: {
        schema_version: '1.0', task: 'respond', decision: {
          action: 'delegate', tool_ids: [], response: null, confidence: 'high', rationale_codes: ['calendar_action'],
        },
      }, latencyMs: 1,
    }),
    inferClarify: async () => ({
      output: {
        schema_version: '1.0', task: 'clarify', decision: {
          needed: false, can_begin: true, question: null, missing_fields: [], confidence: 'high',
          rationale_codes: ['complete_schedule'],
        },
      }, latencyMs: 1,
    }),
    inferExecution: async () => ({
      output: {
        schema_version: '1.0', task: 'execution', decision: {
          response_mode: 'blocked', tool_ids: [], worker_id: null, tier: 'local', workspace_id: null,
          permission_triggers: [], confidence: 'high', rationale_codes: ['calendar_disconnected'],
        },
      }, latencyMs: 1,
    }),
    inferBrief: async () => { throw new Error('brief should not run'); },
    inferSupervise: async () => { throw new Error('supervision should not run'); },
  };
  const engine: ExecutionEngine = {
    id: 'codex-cli', displayName: 'Codex', capabilities: ['ask', 'work'], available: true,
    run: async () => { engineCalls += 1; return { answer: 'unexpected', costUsd: 0 }; }, cancel: () => false,
  };
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });
  const result = await core.submitManaged({
    text: 'Set my daily schedule with gym 9-11, school 12-1 and 4-6, research 1-4, and capstone 6-8.',
  });
  await waitForTaskStatus(db, result.taskId, 'done');
  assert.equal(engineCalls, 0);
  const memory = db.prepare(
    "SELECT category, content FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL"
  ).get() as { category: string; content: string };
  assert.equal(memory.category, 'manager:context:lifestyle');
  assert.match(memory.content, /gym 9-11/);
  const answer = db.prepare(
    "SELECT content FROM conversation_messages WHERE task_id = ? AND role = 'assistant'"
  ).get(result.taskId) as { content: string };
  assert.match(answer.content, /saved.*local Lifestyle vault/i);
  assert.match(memory.content, /Set my daily schedule/);
});

test('production manager output ceilings accommodate UUID-rich validated decisions', () => {
  assert.ok(MANAGER_OUTPUT_TOKEN_CAPS.continuity >= 192);
  assert.ok(MANAGER_OUTPUT_TOKEN_CAPS.retrieval >= 768);
  assert.ok(MANAGER_OUTPUT_TOKEN_CAPS.memory >= 384);
  assert.ok(MANAGER_OUTPUT_TOKEN_CAPS.brief >= 768);
  assert.ok(MANAGER_OUTPUT_TOKEN_CAPS.respond >= 768);
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

test('managed submission makes valid manager route and continuity authoritative', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-manager-authority-'));
  const db = openDb(join(dataDir, 'grover.db'));
  let respondInput: Record<string, unknown> | null = null;
  const manager: ManagerPlanner = {
    status: () => ({ state: 'ready', detail: 'test', modelHash: 'AUTHORITY_HASH', lastLatencyMs: null }),
    inferRoute: async () => ({
      output: {
        schema_version: '1.0', task: 'route',
        decision: { destination: 'coding', work_kind: 'work', confidence: 'high', rationale_codes: ['manager_selected_coding'] },
      },
      latencyMs: 7,
    }),
    inferContinuity: async () => ({
      output: {
        schema_version: '1.0', task: 'continuity',
        decision: {
          action: 'branch', target_conversation_id: null, target_project_id: null, search_needed: false,
          confidence: 'high', rationale_codes: ['manager_new_specialist_work'],
        },
      },
      latencyMs: 8,
    }),
    inferRetrieval: async (input) => {
      const conversations = ((input.candidates as Record<string, unknown>).conversations as { id: string }[]);
      return {
        output: {
          schema_version: '1.0', task: 'retrieval',
          decision: {
            conversation_ids: [conversations[0].id], project_ids: [], memory_ids: [], search_queries: [], untrusted_ids: [],
            confidence: 'high', rationale_codes: ['manager_minimum_context'],
          },
        },
        latencyMs: 9,
      };
    },
    inferMemory: async (input) => ({
      output: {
        schema_version: '1.0', task: 'memory',
        decision: {
          operation: 'create', target_memory_id: null, scope: `project:${input.project_id}`,
          canonical_fact: 'The project should be handled as Coding work.', sensitivity: 'private',
          expires: false, confidence: 'high', rationale_codes: ['project_requirement'],
        },
      },
      latencyMs: 9,
    }),
    inferRespond: async (input) => {
      respondInput = input;
      return {
        output: {
          schema_version: '1.0', task: 'respond',
          decision: { action: 'delegate', tool_ids: [], response: null, confidence: 'high', rationale_codes: ['worker_needed'] },
        },
        latencyMs: 10,
      };
    },
    inferClarify: async () => ({
      output: {
        schema_version: '1.0', task: 'clarify',
        decision: { needed: false, can_begin: true, question: null, missing_fields: [], confidence: 'high', rationale_codes: ['request_clear'] },
      },
      latencyMs: 11,
    }),
    inferExecution: async () => ({
      output: {
        schema_version: '1.0', task: 'execution',
        decision: {
          response_mode: 'delegate', tool_ids: ['project_files'], worker_id: 'worker_frontier', tier: 'frontier',
          workspace_id: 'workspace_project', permission_triggers: [], confidence: 'high', rationale_codes: ['coding_worker'],
        },
      },
      latencyMs: 12,
    }),
    inferBrief: async (input) => ({
      output: {
        schema_version: '1.0', task: 'brief',
        decision: {
          objective: 'Handle the coding request',
          context_refs: (input.available_refs as { id: string }[]).map((item) => item.id),
          constraints: ['stay local'], deliverables: ['working response'], verification: ['verify result'],
          stop_conditions: ['stop before deployment'],
        },
      },
      latencyMs: 13,
    }),
    inferSupervise: async () => ({
      output: { schema_version: '1.0', task: 'supervise', decision: {
        action: 'accept', next_worker_id: null, missing_evidence: [], question: null,
        confidence: 'high', rationale_codes: ['worker_result_present'],
      } }, latencyMs: 14,
    }),
  };
  const engine: ExecutionEngine = {
    id: 'codex-cli', displayName: 'Codex', capabilities: ['ask', 'work', 'project', 'build'], available: true,
    run: async () => ({ answer: 'managed result', costUsd: 0 }), cancel: () => false,
  };
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });
  const result = await core.submitManaged({ text: 'Hello, take this as coding work' });
  assert.equal(result.context, 'coding');
  assert.equal(result.intent, 'work');
  assert.equal(result.conversationDisposition, 'created');
  assert.deepEqual(respondInput?.local_state, {}, 'project goals are briefing context, not a local answer to the work request');
  const task = db.prepare('SELECT domain FROM task_state WHERE task_id = ?').get(result.taskId) as { domain: string };
  assert.equal(task.domain, 'coding');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const assistant = db.prepare("SELECT id FROM conversation_messages WHERE task_id = ? AND role = 'assistant'").get(result.taskId);
    if (assistant) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  const stages = db.prepare(
    `SELECT s.stage FROM manager_stage_records s JOIN manager_flights f ON f.id = s.flight_id
     WHERE f.task_id = ? ORDER BY s.sequence`
  ).all(result.taskId) as { stage: string }[];
  assert.deepEqual(stages.map((stage) => stage.stage).sort(), [
    'brief', 'clarify', 'continuity', 'execution', 'memory', 'respond', 'retrieval', 'route', 'supervise',
  ]);
  const flight = db.prepare('SELECT state, request_hash FROM manager_flights WHERE task_id = ?').get(result.taskId) as
    { state: string; request_hash: string };
  assert.equal(flight.state, 'completed');
  assert.match(flight.request_hash, /^[a-f0-9]{64}$/);
  const projectMemory = db.prepare(
    `SELECT pm.kind, pm.content FROM project_memories pm JOIN project_records p ON p.id = pm.project_id
     WHERE p.conversation_id = ? AND pm.kind = 'requirement'`
  ).get(result.conversationId) as { kind: string; content: string };
  assert.equal(projectMemory.content, 'The project should be handled as Coding work.');
});

test('managed local response is used instead of a conflicting built-in answer', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-manager-response-authority-'));
  const db = openDb(join(dataDir, 'grover.db'));
  let delegated = false;
  const manager: ManagerPlanner = {
    status: () => ({ state: 'ready', detail: 'test', modelHash: 'AUTHORITY_HASH', lastLatencyMs: null }),
    inferRoute: async () => ({
      output: { schema_version: '1.0', task: 'route', decision: {
        destination: 'general', work_kind: 'ask', confidence: 'high', rationale_codes: ['general_greeting'],
      } }, latencyMs: 1,
    }),
    inferContinuity: async () => ({
      output: { schema_version: '1.0', task: 'continuity', decision: {
        action: 'create', target_conversation_id: null, target_project_id: null, search_needed: false,
        confidence: 'high', rationale_codes: ['new_general_conversation'],
      } }, latencyMs: 1,
    }),
    inferRetrieval: async (input) => ({
      output: { schema_version: '1.0', task: 'retrieval', decision: {
        conversation_ids: [((input.candidates as Record<string, unknown>).conversations as { id: string }[])[0].id],
        project_ids: [], memory_ids: [], search_queries: [], untrusted_ids: [], confidence: 'high', rationale_codes: ['no_memory_needed'],
      } }, latencyMs: 1,
    }),
    inferMemory: async () => ({
      output: { schema_version: '1.0', task: 'memory', decision: {
        operation: 'create', target_memory_id: null, scope: 'global', canonical_fact: 'The user said Hello.',
        sensitivity: 'private', expires: false, confidence: 'high', rationale_codes: ['durable_greeting'],
      } }, latencyMs: 1,
    }),
    inferRespond: async () => ({
      output: { schema_version: '1.0', task: 'respond', decision: {
        action: 'answer_local', tool_ids: [], response: 'Manager-owned greeting.', confidence: 'high', rationale_codes: ['local_greeting'],
      } }, latencyMs: 1,
    }),
    inferClarify: async () => { delegated = true; throw new Error('clarify should not run'); },
    inferExecution: async () => { delegated = true; throw new Error('execution should not run'); },
    inferBrief: async () => { delegated = true; throw new Error('brief should not run'); },
    inferSupervise: async () => { delegated = true; throw new Error('supervise should not run'); },
  };
  const engine: ExecutionEngine = {
    id: 'codex-cli', displayName: 'Codex', capabilities: ['ask'], available: true,
    run: async () => { delegated = true; return { answer: 'wrong', costUsd: 0 }; }, cancel: () => false,
  };
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([engine]) });
  const result = await core.submitManaged({ text: 'hello' });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const message = db.prepare("SELECT content FROM conversation_messages WHERE task_id = ? AND role = 'assistant'").get(result.taskId);
    if (message) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  const message = db.prepare(
    "SELECT content FROM conversation_messages WHERE task_id = ? AND role = 'assistant'"
  ).get(result.taskId) as { content: string };
  assert.equal(message.content, 'Manager-owned greeting.');
  assert.equal(delegated, false);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM memories').get() as { count: number }).count, 0);
  const memoryIncident = db.prepare("SELECT kind, status FROM incidents WHERE kind = 'wrong_memory'").get() as
    { kind: string; status: string };
  assert.equal(memoryIncident.status, 'open');
});

test('managed memory decision automatically saves a high-confidence durable fact', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-manager-memory-authority-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const manager: ManagerPlanner = {
    status: () => ({ state: 'ready', detail: 'test', modelHash: 'AUTHORITY_HASH', lastLatencyMs: null }),
    inferRoute: async () => ({ output: { schema_version: '1.0', task: 'route', decision: {
      destination: 'general', work_kind: 'ask', confidence: 'high', rationale_codes: ['profile_statement'],
    } }, latencyMs: 1 }),
    inferContinuity: async () => ({ output: { schema_version: '1.0', task: 'continuity', decision: {
      action: 'create', target_conversation_id: null, target_project_id: null, search_needed: false,
      confidence: 'high', rationale_codes: ['new_general_conversation'],
    } }, latencyMs: 1 }),
    inferRetrieval: async (input) => ({ output: { schema_version: '1.0', task: 'retrieval', decision: {
      conversation_ids: [((input.candidates as Record<string, unknown>).conversations as { id: string }[])[0].id],
      project_ids: [], memory_ids: [], search_queries: [], untrusted_ids: [], confidence: 'high', rationale_codes: ['none_needed'],
    } }, latencyMs: 1 }),
    inferMemory: async () => ({ output: { schema_version: '1.0', task: 'memory', decision: {
      operation: 'create', target_memory_id: null, scope: 'global', canonical_fact: "Will's preferred name is Will.",
      sensitivity: 'private', expires: false, confidence: 'high', rationale_codes: ['stable_profile_fact'],
    } }, latencyMs: 1 }),
    inferRespond: async () => ({ output: { schema_version: '1.0', task: 'respond', decision: {
      action: 'answer_local', tool_ids: [], response: 'Nice to meet you, Will.', confidence: 'high', rationale_codes: ['local_acknowledgement'],
    } }, latencyMs: 1 }),
    inferClarify: async () => { throw new Error('clarify should not run'); },
    inferExecution: async () => { throw new Error('execution should not run'); },
    inferBrief: async () => { throw new Error('brief should not run'); },
    inferSupervise: async () => { throw new Error('supervise should not run'); },
  };
  const core = new GroverCore({ db, dataDir, manager, router: new EngineRouter([]) });
  await core.submitManaged({ text: 'Hi, my name is Will.' });
  const saved = db.prepare(
    "SELECT content, category FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL"
  ).get() as { content: string; category: string };
  assert.equal(saved.content, "Will's preferred name is Will.");
  assert.equal(saved.category, 'manager:global');
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

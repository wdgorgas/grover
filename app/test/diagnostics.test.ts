import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DiagnosticsService } from '../src/diagnostics.ts';
import { openDb } from '../src/db.ts';
import { addConversationMessage, appendTaskProgress, createConversation, createTask } from '../src/store.ts';

test('flight recorder stores ordered bounded stages and follows terminal task state', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-flight-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const diagnostics = new DiagnosticsService(db);
  const conversationId = createConversation(db, 'general', 'hello');
  const taskId = createTask(db, 'ask', 'hello', 'general');
  diagnostics.beginFlight({
    taskId, conversationId, requestHash: 'a'.repeat(64), modelHash: 'MODEL_HASH',
  });
  diagnostics.recordStage({
    taskId, stage: 'route', inputRefs: { request_sha256: 'a'.repeat(64), conversation_ids: [conversationId] },
    output: { decision: { destination: 'general' } }, latencyMs: 125, modelHash: 'MODEL_HASH',
  });
  diagnostics.recordStage({
    taskId, stage: 'respond', inputRefs: { available_ids: [] },
    output: { decision: { action: 'answer_local' } }, latencyMs: 225, modelHash: 'MODEL_HASH',
  });
  appendTaskProgress(db, taskId, 'done', 'Finished', 'hello');
  diagnostics.syncFlightStates();
  const flight = db.prepare('SELECT state, total_latency_ms FROM manager_flights WHERE task_id = ?').get(taskId) as
    { state: string; total_latency_ms: number };
  assert.equal(flight.state, 'completed');
  assert.equal(flight.total_latency_ms, 350);
  const stages = db.prepare(
    `SELECT sequence, stage, input_refs_json FROM manager_stage_records
     WHERE flight_id = (SELECT id FROM manager_flights WHERE task_id = ?) ORDER BY sequence`
  ).all(taskId) as { sequence: number; stage: string; input_refs_json: string }[];
  assert.deepEqual(stages.map((stage) => [stage.sequence, stage.stage]), [[1, 'route'], [2, 'respond']]);
  assert.equal(stages.some((stage) => stage.input_refs_json.includes('hello')), false);
});

test('automatic incidents deduplicate recurring latency and retain occurrences', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-incidents-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const diagnostics = new DiagnosticsService(db);
  for (let index = 0; index < 2; index += 1) {
    const conversationId = createConversation(db, 'general', `case ${index}`);
    const taskId = createTask(db, 'ask', `case ${index}`, 'general');
    diagnostics.beginFlight({ taskId, conversationId, requestHash: String(index).repeat(64), modelHash: 'MODEL_HASH' });
    diagnostics.recordStage({
      taskId, stage: 'route', inputRefs: { request_sha256: String(index).repeat(64) },
      output: { decision: { destination: 'general' } }, latencyMs: 4_000 + index,
    });
  }
  const incident = db.prepare("SELECT occurrence_count, severity, status FROM incidents WHERE kind = 'latency'").get() as
    { occurrence_count: number; severity: string; status: string };
  assert.equal(incident.occurrence_count, 2);
  assert.equal(incident.severity, 'low');
  assert.equal(incident.status, 'open');
  const occurrences = db.prepare('SELECT COUNT(*) AS count FROM incident_occurrences').get() as { count: number };
  assert.equal(occurrences.count, 2);
});

test('manager failures before task creation are retained without storing the prompt', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-preflight-incident-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const diagnostics = new DiagnosticsService(db);
  diagnostics.captureUnassignedManagerFailure('private request text', 'continuity', new Error('schema validation failed'));
  const row = db.prepare('SELECT kind, summary FROM incidents').get() as { kind: string; summary: string };
  assert.equal(row.kind, 'validation_failure');
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM incidents').all()).includes('private request text'), false);
});

test('user report preserves correction and supports inbox status changes', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-user-incident-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const diagnostics = new DiagnosticsService(db);
  const conversationId = createConversation(db, 'coding', 'quant bot');
  const taskId = createTask(db, 'work', 'build a quant bot', 'coding');
  diagnostics.beginFlight({ taskId, conversationId, requestHash: 'b'.repeat(64) });
  const id = diagnostics.reportProblem(
    taskId, 'wrong_route', 'This should have stayed in Coding.', 'Use Coding even though the product is financial.',
  );
  const report = db.prepare('SELECT source, kind, note, correction_json, status FROM incidents WHERE id = ?').get(id) as
    { source: string; kind: string; note: string; correction_json: string; status: string };
  assert.equal(report.source, 'will_correction');
  assert.equal(report.kind, 'wrong_route');
  assert.equal(report.note, 'This should have stayed in Coding.');
  assert.equal(JSON.parse(report.correction_json).expected, 'Use Coding even though the product is financial.');
  assert.equal(report.status, 'open');
  diagnostics.updateIncidentStatus(id, 'fixed');
  assert.equal((db.prepare('SELECT status FROM incidents WHERE id = ?').get(id) as { status: string }).status, 'fixed');
  diagnostics.updateIncidentStatus(id, 'reopen');
  assert.equal((db.prepare('SELECT status FROM incidents WHERE id = ?').get(id) as { status: string }).status, 'open');
});

test('reported manager decision replays, promotes, and detects a later regression', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-regression-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const diagnostics = new DiagnosticsService(db);
  const conversationId = createConversation(db, 'general', 'quant bot request');
  const taskId = createTask(db, 'work', 'build a quant bot for investing', 'coding');
  addConversationMessage(db, conversationId, taskId, 'user', 'build a quant bot for investing');
  diagnostics.beginFlight({ taskId, conversationId, requestHash: 'c'.repeat(64), modelHash: 'MODEL_A' });
  const original = { schema_version: '1.0', task: 'route', decision: {
    destination: 'finance', work_kind: 'work', confidence: 'high', rationale_codes: ['financial_product'],
  } };
  diagnostics.recordStage({
    taskId, stage: 'route', inputRefs: { request_sha256: 'c'.repeat(64) },
    replayInput: {
      request: 'build a quant bot for investing', current_context: 'general',
      current_conversation_summary: 'quant bot request',
    },
    output: original, latencyMs: 100, modelHash: 'MODEL_A',
  });
  const incidentId = diagnostics.reportProblem(
    taskId, 'wrong_route', 'Software construction belongs in Coding.', 'Route this work to Coding.',
  );
  const storedSnapshot = (db.prepare(
    'SELECT input_snapshot_json FROM regression_cases WHERE incident_id = ?'
  ).get(incidentId) as { input_snapshot_json: string }).input_snapshot_json;
  assert.equal(storedSnapshot.includes('build a quant bot for investing'), false, 'replay snapshot references the task request');
  const replay = diagnostics.replayCaseForIncident(incidentId);
  assert.equal(replay.stage, 'route');
  assert.equal(replay.input.request, 'build a quant bot for investing');
  const corrected = { schema_version: '1.0', task: 'route', decision: {
    destination: 'coding', work_kind: 'work', confidence: 'high', rationale_codes: ['software_creation'],
  } };
  assert.equal(diagnostics.recordReplay(replay.id, corrected, 90, 'MODEL_B'), 'changed');
  diagnostics.promoteLatestReplay(incidentId);
  assert.equal(diagnostics.activeRegressionIncidentIds().includes(incidentId), true);
  assert.equal(diagnostics.recordReplay(replay.id, corrected, 80, 'MODEL_B'), 'passed');
  assert.equal((db.prepare('SELECT status FROM incidents WHERE id = ?').get(incidentId) as { status: string }).status, 'replay_passed');
  assert.equal(diagnostics.recordReplay(replay.id, original, 70, 'MODEL_C'), 'failed');
  assert.equal((db.prepare('SELECT status FROM incidents WHERE id = ?').get(incidentId) as { status: string }).status, 'open');
});

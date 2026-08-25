import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DiagnosticsService } from '../src/diagnostics.ts';
import { openDb } from '../src/db.ts';
import { appendTaskProgress, createConversation, createTask } from '../src/store.ts';

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

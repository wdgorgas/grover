import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LocalManagerRuntime } from '../src/manager.ts';

const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
const datasetPath = join(local, 'GROVER', 'manager-training', 'datasets', 'curriculum-v3', 'test.jsonl');
const protectedPath = join(
  local, 'GROVER', 'manager-inference', 'benchmarks', 'nf4-merged-q8-checkpoint-750-sample90',
  'evaluation_predictions_test.jsonl',
);
if (!existsSync(datasetPath) || !existsSync(protectedPath)) {
  throw new Error('The local protected manager sample is unavailable. Copy the manager training and inference folders first.');
}

const lines = (path) => readFileSync(path, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const inputs = new Map(lines(datasetPath).map((row) => [row.id, row.input]));
const protectedRows = lines(protectedPath);
const perTask = new Map();
for (const row of protectedRows) {
  const selected = perTask.get(row.task) ?? [];
  if (selected.length < 2) selected.push(row);
  perTask.set(row.task, selected);
}
const tasks = ['route', 'continuity', 'retrieval', 'memory', 'execution', 'clarify', 'brief', 'supervise', 'respond'];
const method = {
  route: 'inferRoute', continuity: 'inferContinuity', retrieval: 'inferRetrieval', memory: 'inferMemory',
  execution: 'inferExecution', clarify: 'inferClarify', brief: 'inferBrief', supervise: 'inferSupervise', respond: 'inferRespond',
};
assert.ok(tasks.every((task) => perTask.get(task)?.length === 2), 'protected sample must contain two cases per manager task');

const runtime = new LocalManagerRuntime();
const measurements = [];
try {
  await runtime.start();
  assert.equal(runtime.status().state, 'ready', runtime.status().detail);
  for (const task of tasks) {
    for (const row of perTask.get(task)) {
      const input = inputs.get(row.id);
      assert.ok(input, `missing protected input ${row.id}`);
      const first = await runtime[method[task]](input);
      assert.deepEqual(first.output, row.expected, `${task} changed protected behavior for ${row.id}`);
      const repeated = await runtime[method[task]](input);
      assert.deepEqual(repeated.output, row.expected, `${task} cache changed protected behavior for ${row.id}`);
      assert.equal(repeated.cacheHit, true);
      assert.equal(repeated.latencyMs, 0);
      measurements.push({ task, id: row.id, latency_ms: first.latencyMs });
    }
  }
  console.log(`Manager schema/cache parity passed: ${JSON.stringify({ cases: measurements.length, measurements })}`);
} finally {
  runtime.stop();
}

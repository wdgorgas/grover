import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GroverCore } from '../src/core.ts';
import { openDb } from '../src/db.ts';
import { EngineRouter, type EngineRunOptions, type ExecutionEngine } from '../src/engine.ts';

class WaitingEngine implements ExecutionEngine {
  readonly id = 'codex-cli';
  readonly displayName = 'Waiting Codex';
  readonly capabilities = ['ask', 'work', 'build'] as const;
  readonly available = true;
  private rejectors = new Map<string, (error: Error) => void>();

  run(options: EngineRunOptions): Promise<{ answer: string; costUsd: number }> {
    return new Promise((_resolve, reject) => this.rejectors.set(options.runKey, reject));
  }

  cancel(runKey: string): boolean {
    const reject = this.rejectors.get(runKey);
    if (!reject) return false;
    reject(new Error('cancelled'));
    this.rejectors.delete(runKey);
    return true;
  }
}

test('kill switch cancels active conversational work instead of leaving it running forever', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-core-'));
  const db = openDb(':memory:');
  const engine = new WaitingEngine();
  const core = new GroverCore({
    db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..'),
    router: new EngineRouter([engine]),
  });
  const { taskId } = core.submit({ text: 'What is active?', intent: 'ask', engine: 'codex-cli' });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  core.setKillSwitch(true);
  const state = core.getSnapshot() as any;
  const task = state.tasks.find((item: any) => item.task_id === taskId);
  assert.equal(task.status, 'cancelled');
  assert.deepEqual(JSON.parse(task.actions), []);
});

test('renderer-like invalid workspace input is rejected at runtime', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-core-invalid-'));
  const db = openDb(':memory:');
  const core = new GroverCore({ db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..') });
  assert.throws(() => core.submit({ text: 'bad', context: 'teleport' as never }), /Unknown conversation workspace/);
});

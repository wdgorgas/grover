import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EngineRouter, type EngineRunOptions, type ExecutionEngine } from '../src/engine.ts';

function fake(id: string, available = true): ExecutionEngine {
  return {
    id,
    displayName: id,
    capabilities: ['ask', 'work', 'build'],
    available,
    async run(_options: EngineRunOptions) { return { answer: id, costUsd: 0 }; },
    cancel() { return true; },
  };
}

test('auto routing prefers Codex but remains provider-neutral', () => {
  const router = new EngineRouter([fake('codex-cli'), fake('claude-cli')]);
  const route = router.route('build');
  assert.equal(route.selected.id, 'codex-cli');
  assert.equal(route.backup?.id, 'claude-cli');
});

test('explicit preference and availability override the initial priority', () => {
  let router = new EngineRouter([fake('codex-cli'), fake('claude-cli')]);
  assert.equal(router.route('ask', 'claude-cli').selected.id, 'claude-cli');
  router = new EngineRouter([fake('codex-cli', false), fake('claude-cli')]);
  assert.equal(router.route('build').selected.id, 'claude-cli');
});

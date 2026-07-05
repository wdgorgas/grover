// event-spine.test.ts — verifies the §4.3 rules the spine slice claims to implement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.ts';
import { appendEvent, type EventInput } from '../src/events.ts';
import { rebuildProjections } from '../src/reducers.ts';

function freshDb() {
  return openDb(':memory:');
}

function taskEvent(overrides: Partial<EventInput> = {}): EventInput {
  return {
    scopeType: 'task',
    taskId: 'task-1',
    idempotencyKey: `key-${Math.random()}`,
    actor: 'will',
    phase: 'intake',
    plainLanguage: 'Starting work on the theme picker',
    ...overrides,
  };
}

test('plain_language is mandatory — empty or whitespace events are rejected', () => {
  const db = freshDb();
  assert.throws(() => appendEvent(db, taskEvent({ plainLanguage: '' })), /plain_language/);
  assert.throws(() => appendEvent(db, taskEvent({ plainLanguage: '   ' })), /plain_language/);
  const count = db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number };
  assert.equal(count.n, 0, 'no event row may exist after rejected appends');
});

test('events reduce into one authoritative task_state with server-computed actions', () => {
  const db = freshDb();
  appendEvent(db, taskEvent({ phase: 'intake', plainLanguage: 'Got the request' }));
  appendEvent(db, taskEvent({ phase: 'editing', plainLanguage: 'Editing the settings page' }));
  appendEvent(db, taskEvent({ phase: 'done', plainLanguage: 'Theme picker is live' }));

  const rows = db.prepare('SELECT * FROM task_state').all() as Record<string, unknown>[];
  assert.equal(rows.length, 1, 'one task, one authoritative status row');
  const t = rows[0];
  assert.equal(t.status, 'done');
  assert.equal(t.plain_language, 'Theme picker is live');
  assert.equal(t.origin, 'foreground', 'will-initiated task is foreground');
  assert.deepEqual(JSON.parse(t.actions as string), [], 'terminal task exposes no actions');
});

test('active task exposes pause/cancel; blocked task only cancel; never verify', () => {
  const db = freshDb();
  appendEvent(db, taskEvent({ phase: 'editing' }));
  let t = db.prepare('SELECT actions FROM task_state').get() as { actions: string };
  assert.deepEqual(JSON.parse(t.actions), ['pause', 'cancel']);
  assert.ok(!JSON.parse(t.actions).includes('verify'), 'verify on a running task is impossible');

  appendEvent(db, taskEvent({ phase: 'blocked' }));
  t = db.prepare('SELECT actions FROM task_state').get() as { actions: string };
  assert.deepEqual(JSON.parse(t.actions), ['cancel']);
});

test('grover-initiated task is background', () => {
  const db = freshDb();
  appendEvent(db, taskEvent({ actor: 'grover', taskId: 'task-bg' }));
  const t = db.prepare("SELECT origin FROM task_state WHERE task_id = 'task-bg'").get() as {
    origin: string;
  };
  assert.equal(t.origin, 'background');
});

test('duplicate idempotency key: no second event, no double side effect', () => {
  const db = freshDb();
  const input = taskEvent({ idempotencyKey: 'fixed-key', costDelta: 250_000 }); // $0.25
  const first = appendEvent(db, input);
  const second = appendEvent(db, input);

  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(second.event.event_id, first.event.event_id);

  const count = db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number };
  assert.equal(count.n, 1);
  const t = db.prepare('SELECT cost_total FROM task_state').get() as { cost_total: number };
  assert.equal(t.cost_total, 250_000, 'cost applied exactly once');
});

test('reducers order by seq, not timestamp', () => {
  const db = freshDb();
  appendEvent(db, taskEvent({ phase: 'editing', ts: '2026-07-05T10:00:00Z', plainLanguage: 'Later timestamp, earlier seq' }));
  appendEvent(db, taskEvent({ phase: 'done', ts: '2026-07-05T09:00:00Z', plainLanguage: 'Earlier timestamp, later seq' }));
  const t = db.prepare('SELECT status, plain_language FROM task_state').get() as {
    status: string; plain_language: string;
  };
  assert.equal(t.status, 'done', 'seq order wins over timestamp order');
  assert.equal(t.plain_language, 'Earlier timestamp, later seq');
});

test('cost_delta accumulates in micro-USD across task and build projections', () => {
  const db = freshDb();
  appendEvent(db, taskEvent({ buildRunId: 'run-1', costDelta: 100_000 }));
  appendEvent(db, taskEvent({ buildRunId: 'run-1', phase: 'editing', costDelta: 50_000 }));
  const t = db.prepare('SELECT cost_total FROM task_state').get() as { cost_total: number };
  const b = db.prepare('SELECT cost_total FROM build_state').get() as { cost_total: number };
  assert.equal(t.cost_total, 150_000);
  assert.equal(b.cost_total, 150_000);
  assert.throws(() => appendEvent(db, taskEvent({ costDelta: 0.5 })), /integer/);
});

test('P1 exit criterion: projections rebuilt from the log equal incremental state', () => {
  const db = freshDb();
  // A varied history across two tasks and a build run.
  appendEvent(db, taskEvent({ taskId: 'task-A', phase: 'intake' }));
  appendEvent(db, taskEvent({ taskId: 'task-A', phase: 'editing', buildRunId: 'run-A', costDelta: 30_000 }));
  appendEvent(db, taskEvent({ taskId: 'task-B', actor: 'grover', phase: 'planning' }));
  appendEvent(db, taskEvent({ taskId: 'task-A', phase: 'verifying', buildRunId: 'run-A' }));
  appendEvent(db, taskEvent({ taskId: 'task-B', actor: 'engine', phase: 'blocked' }));
  appendEvent(db, taskEvent({ taskId: 'task-A', phase: 'done', buildRunId: 'run-A', costDelta: 12_000 }));

  const before = {
    tasks: db.prepare('SELECT * FROM task_state ORDER BY task_id').all(),
    builds: db.prepare('SELECT * FROM build_state ORDER BY build_run_id').all(),
  };

  rebuildProjections(db);

  const after = {
    tasks: db.prepare('SELECT * FROM task_state ORDER BY task_id').all(),
    builds: db.prepare('SELECT * FROM build_state ORDER BY build_run_id').all(),
  };

  assert.deepEqual(after, before, 'delete + replay reproduces identical projections');
});

test('event log and projections survive restart (file-backed DB reopen)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'grover-test-'));
  const path = join(dir, 'grover.db');

  const db1 = openDb(path);
  appendEvent(db1, taskEvent({ phase: 'editing', plainLanguage: 'Persisted work', costDelta: 75_000 }));
  db1.close();

  const db2 = openDb(path);
  const ev = db2.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number };
  const t = db2.prepare('SELECT status, cost_total FROM task_state').get() as {
    status: string; cost_total: number;
  };
  assert.equal(ev.n, 1);
  assert.equal(t.status, 'editing');
  assert.equal(t.cost_total, 75_000);
  db2.close();
});

test('events table rejects invalid enum values at the schema level', () => {
  const db = freshDb();
  assert.throws(() =>
    appendEvent(db, taskEvent({ actor: 'chatgpt' as never }))
  );
  assert.throws(() =>
    appendEvent(db, taskEvent({ phase: 'vibing' as never }))
  );
});

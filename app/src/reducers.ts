// reducers.ts — the ONLY code allowed to write projection tables (master prompt §4.3).
// Projections are disposable: rebuildProjections() deletes them and replays the
// append-only log by seq. Incremental apply and replay share applyEventToProjections,
// so the two paths cannot drift apart.
//
// Status/action mappings here are the narrow placeholders recorded in
// DECISIONS.md (2026-07-05, "Event-spine slice: derived reducer semantics").
import type { DatabaseSync } from 'node:sqlite';
import type { EventRow } from './events.ts';

/** Task lifecycle phases — the events.phase values that change a task's status. */
const TASK_LIFECYCLE = new Set([
  'intake', 'planning', 'editing', 'verifying', 'blocked', 'done', 'failed', 'cancelled',
]);

const TERMINAL = new Set(['done', 'failed', 'cancelled']);

/**
 * Available actions are computed HERE, server-side, into the projection.
 * The client may never infer actions (§4.3) — a Verify button on a running
 * task is structurally impossible because 'verify' is never in this list.
 */
export function availableActions(status: string): string[] {
  if (TERMINAL.has(status)) return [];
  if (status === 'blocked') return ['cancel'];
  return ['pause', 'cancel'];
}

/** BuildRun status placeholder mapping (full state machine lands with the engine slice). */
function buildRunStatus(phase: string): string {
  switch (phase) {
    case 'verifying': return 'verifying';
    case 'blocked': return 'blocked';
    case 'done': return 'passed';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    default: return 'running';
  }
}

export function applyEventToProjections(db: DatabaseSync, ev: EventRow): void {
  if (ev.task_id) applyToTaskState(db, ev);
  if (ev.build_run_id) applyToBuildState(db, ev);
}

function applyToTaskState(db: DatabaseSync, ev: EventRow): void {
  const existing = db
    .prepare('SELECT * FROM task_state WHERE task_id = ?')
    .get(ev.task_id) as { status: string; origin: string; cost_total: number } | undefined;

  const isLifecycle = TASK_LIFECYCLE.has(ev.phase);
  const status = isLifecycle ? ev.phase : (existing?.status ?? 'intake');
  // Foreground vs background derives from the first event's actor (§4.3; DECISIONS.md).
  const origin = existing?.origin ?? (ev.actor === 'will' ? 'foreground' : 'background');
  const costTotal = (existing?.cost_total ?? 0) + (ev.cost_delta ?? 0);

  db.prepare(
    `INSERT INTO task_state
       (task_id, status, origin, plain_language, actions, cost_total, updated_seq, updated_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(task_id) DO UPDATE SET
       status = excluded.status,
       plain_language = excluded.plain_language,
       actions = excluded.actions,
       cost_total = excluded.cost_total,
       updated_seq = excluded.updated_seq,
       updated_ts = excluded.updated_ts`
  ).run(
    ev.task_id,
    status,
    origin,
    ev.plain_language,
    JSON.stringify(availableActions(status)),
    costTotal,
    ev.seq,
    ev.ts
  );
}

function applyToBuildState(db: DatabaseSync, ev: EventRow): void {
  const existing = db
    .prepare('SELECT * FROM build_state WHERE build_run_id = ?')
    .get(ev.build_run_id) as { cost_total: number } | undefined;

  const costTotal = (existing?.cost_total ?? 0) + (ev.cost_delta ?? 0);

  db.prepare(
    `INSERT INTO build_state
       (build_run_id, status, current_phase, plain_language, cost_total, updated_seq, updated_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(build_run_id) DO UPDATE SET
       status = excluded.status,
       current_phase = excluded.current_phase,
       plain_language = excluded.plain_language,
       cost_total = excluded.cost_total,
       updated_seq = excluded.updated_seq,
       updated_ts = excluded.updated_ts`
  ).run(
    ev.build_run_id,
    buildRunStatus(ev.phase),
    ev.phase,
    ev.plain_language,
    costTotal,
    ev.seq,
    ev.ts
  );
}

/**
 * The P1 exit criterion (§13): delete projections, replay events by seq,
 * and the result must equal the incrementally-maintained state.
 */
export function rebuildProjections(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec('DELETE FROM task_state;');
    db.exec('DELETE FROM build_state;');
    const events = db
      .prepare('SELECT * FROM events ORDER BY seq ASC')
      .all() as unknown as EventRow[];
    for (const ev of events) applyEventToProjections(db, ev);
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

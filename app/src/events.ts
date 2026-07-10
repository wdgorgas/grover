// events.ts — the only write path into the event log (master prompt §4.3).
// Rules enforced here: plain_language mandatory and human-readable (non-empty,
// capped), idempotency keys prevent duplicate events/side effects (reuse with a
// different payload is a hard conflict — proposal 001), append + projection
// update happen in one transaction so they can never disagree.
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { applyEventToProjections } from './reducers.ts';

export type ScopeType =
  | 'task' | 'build_run' | 'feature_request' | 'system' | 'policy' | 'budget' | 'memory';
export type Actor = 'will' | 'grover' | 'engine' | 'tool' | 'system';
export type Phase =
  | 'intake' | 'planning' | 'editing' | 'verifying' | 'blocked' | 'done' | 'failed'
  | 'cancelled' | 'policy' | 'budget' | 'memory' | 'system';

export interface EventInput {
  scopeType: ScopeType;
  scopeId?: string;
  taskId?: string;
  buildRunId?: string;
  parentEventId?: string;
  idempotencyKey: string;
  actor: Actor;
  domain?: string;
  phase: Phase;
  plainLanguage: string;
  internalDetail?: string;
  evidenceRef?: string;
  /** integer micro-USD (DECISIONS.md 2026-07-05) */
  costDelta?: number;
  modelRunId?: string;
  signoffState?: string;
  /** ISO timestamp; defaults to now. Reducers order by seq, never by ts. */
  ts?: string;
}

export interface EventRow {
  seq: number;
  event_id: string;
  scope_type: string;
  scope_id: string | null;
  task_id: string | null;
  build_run_id: string | null;
  parent_event_id: string | null;
  idempotency_key: string;
  ts: string;
  actor: string;
  domain: string | null;
  phase: string;
  plain_language: string;
  internal_detail: string;
  evidence_ref: string | null;
  cost_delta: number | null;
  model_run_id: string | null;
  signoff_state: string | null;
}

export interface AppendResult {
  event: EventRow;
  /** true if this idempotency key was already recorded — no new event, no new side effects */
  deduplicated: boolean;
}

/** Max plain_language length (DECISIONS.md 2026-07-05, proposal 001 item 8). */
export const PLAIN_LANGUAGE_MAX = 2000;

/**
 * Payload fields compared on idempotency-key reuse (ts excluded — retries carry
 * new timestamps). Same key + different payload = conflict, never silent ignore
 * (proposal 001 item 2).
 */
const PAYLOAD_FIELDS = [
  ['scope_type', 'scopeType'],
  ['scope_id', 'scopeId'],
  ['task_id', 'taskId'],
  ['build_run_id', 'buildRunId'],
  ['parent_event_id', 'parentEventId'],
  ['actor', 'actor'],
  ['domain', 'domain'],
  ['phase', 'phase'],
  ['plain_language', 'plainLanguage'],
  ['internal_detail', 'internalDetail'],
  ['evidence_ref', 'evidenceRef'],
  ['cost_delta', 'costDelta'],
  ['model_run_id', 'modelRunId'],
  ['signoff_state', 'signoffState'],
] as const;

function payloadMismatches(existing: EventRow, input: EventInput): string[] {
  const defaults: Record<string, unknown> = { internal_detail: '' };
  return PAYLOAD_FIELDS.filter(([col, key]) => {
    const oldVal = existing[col as keyof EventRow];
    const newVal = (input as unknown as Record<string, unknown>)[key] ?? defaults[col] ?? null;
    return oldVal !== newVal;
  }).map(([col]) => col);
}

export function appendEvent(db: DatabaseSync, input: EventInput): AppendResult {
  if (!input.plainLanguage || input.plainLanguage.trim().length === 0) {
    throw new Error('plain_language is mandatory on every event (master prompt §4.3)');
  }
  if (input.plainLanguage.length > PLAIN_LANGUAGE_MAX) {
    throw new Error(
      `plain_language exceeds ${PLAIN_LANGUAGE_MAX} chars — put detail in internal_detail or evidence`
    );
  }
  if (!input.idempotencyKey || input.idempotencyKey.trim().length === 0) {
    throw new Error('idempotency_key is mandatory on every event (master prompt §4.3)');
  }
  if (input.costDelta !== undefined && !Number.isInteger(input.costDelta)) {
    throw new Error('cost_delta must be an integer (micro-USD)');
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const existing = db
      .prepare('SELECT * FROM events WHERE idempotency_key = ?')
      .get(input.idempotencyKey) as EventRow | undefined;
    if (existing) {
      const mismatches = payloadMismatches(existing, input);
      if (mismatches.length > 0) {
        throw new Error(
          `idempotency conflict: key '${input.idempotencyKey}' was already used with a ` +
          `different payload (differs in: ${mismatches.join(', ')}). Reusing a key must ` +
          `mean an identical retry, never a new event.`
        );
      }
      db.exec('COMMIT;');
      return { event: existing, deduplicated: true };
    }

    const eventId = randomUUID();
    db.prepare(
      `INSERT INTO events
         (event_id, scope_type, scope_id, task_id, build_run_id, parent_event_id,
          idempotency_key, ts, actor, domain, phase, plain_language, internal_detail,
          evidence_ref, cost_delta, model_run_id, signoff_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      eventId,
      input.scopeType,
      input.scopeId ?? null,
      input.taskId ?? null,
      input.buildRunId ?? null,
      input.parentEventId ?? null,
      input.idempotencyKey,
      input.ts ?? new Date().toISOString(),
      input.actor,
      input.domain ?? null,
      input.phase,
      input.plainLanguage,
      input.internalDetail ?? '',
      input.evidenceRef ?? null,
      input.costDelta ?? null,
      input.modelRunId ?? null,
      input.signoffState ?? null
    );

    const row = db
      .prepare('SELECT * FROM events WHERE event_id = ?')
      .get(eventId) as EventRow;

    applyEventToProjections(db, row);

    db.exec('COMMIT;');
    return { event: row, deduplicated: false };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

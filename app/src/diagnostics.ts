import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type ManagerStage =
  'route' | 'continuity' | 'retrieval' | 'memory' | 'respond' | 'clarify' | 'execution' | 'brief' | 'supervise';
export type IncidentKind =
  'manager_error' | 'validation_failure' | 'provider_failure' | 'task_failure' | 'latency' |
  'wrong_route' | 'wrong_continuity' | 'wrong_memory' | 'wrong_tool' | 'wrong_answer' | 'ux' | 'other';
export type IncidentSource = 'automatic' | 'will_report' | 'will_correction';
export type IncidentSeverity = 'low' | 'medium' | 'high';

type BeginFlightInput = {
  taskId: string;
  conversationId: string;
  projectId?: string | null;
  requestHash: string;
  modelHash?: string | null;
};

type StageInput = {
  taskId: string;
  stage: ManagerStage;
  attempt?: number;
  inputRefs: unknown;
  replayInput?: Record<string, unknown>;
  output?: unknown;
  latencyMs?: number;
  modelHash?: string | null;
  error?: unknown;
};

type IncidentInput = {
  flightId?: string | null;
  taskId?: string | null;
  stageRecordId?: string | null;
  source?: IncidentSource;
  kind: IncidentKind;
  severity?: IncidentSeverity;
  fingerprint?: string;
  summary: string;
  note?: string | null;
  correction?: unknown;
  diagnostic?: unknown;
  occurrence?: unknown;
};

const PROMPT_VERSION = 'manager-v1';
const APP_VERSION = '2.0.0-rc.3';
const INTERACTIVE_LATENCY_TARGET_MS = 3_000;
const DEFAULT_RETENTION_DAYS = 90;
const MIN_OCCURRENCES_PER_INCIDENT = 3;
const MAX_OCCURRENCES_PER_INCIDENT = 20;
const MAX_REPLAYS_PER_CASE = 20;

type RetentionOptions = {
  now?: Date;
  retentionDays?: number;
  minimumOccurrences?: number;
  maximumOccurrences?: number;
  maximumReplays?: number;
};

export type RetentionResult = {
  flights: number;
  stages: number;
  occurrences: number;
  replays: number;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function cleanSummary(value: unknown, max = 1_000): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (normalized || 'Unknown failure').slice(0, max);
}

function automaticFingerprint(kind: IncidentKind, summary: string, stage?: string | null): string {
  const normalized = summary.toLowerCase()
    .replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/g, '<id>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<n>')
    .slice(0, 500);
  return hash(`${kind}|${stage ?? ''}|${normalized}`);
}

function replaySnapshot(taskId: string, input: Record<string, unknown> | undefined): string {
  if (!input) return '{}';
  const copy = JSON.parse(stableJson(input)) as Record<string, unknown>;
  for (const field of ['request', 'goal']) {
    if (typeof copy[field] === 'string') copy[field] = { __grover_ref: 'task_request', task_id: taskId };
  }
  return stableJson(copy);
}

export class DiagnosticsService {
  readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.pruneRetention();
  }

  pruneRetention(options: RetentionOptions = {}): RetentionResult {
    const now = options.now ?? new Date();
    const retentionDays = Math.max(1, Math.trunc(options.retentionDays ?? DEFAULT_RETENTION_DAYS));
    const minimumOccurrences = Math.max(1, Math.trunc(options.minimumOccurrences ?? MIN_OCCURRENCES_PER_INCIDENT));
    const maximumOccurrences = Math.max(
      minimumOccurrences, Math.trunc(options.maximumOccurrences ?? MAX_OCCURRENCES_PER_INCIDENT),
    );
    const maximumReplays = Math.max(1, Math.trunc(options.maximumReplays ?? MAX_REPLAYS_PER_CASE));
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000).toISOString();
    const result: RetentionResult = { flights: 0, stages: 0, occurrences: 0, replays: 0 };

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const incidentIds = this.db.prepare('SELECT id FROM incidents').all() as { id: string }[];
      const occurrences = this.db.prepare(
        'SELECT id, created_at FROM incident_occurrences WHERE incident_id = ? ORDER BY created_at DESC, rowid DESC'
      );
      const deleteOccurrence = this.db.prepare('DELETE FROM incident_occurrences WHERE id = ?');
      for (const incident of incidentIds) {
        const rows = occurrences.all(incident.id) as { id: string; created_at: string }[];
        for (const [index, row] of rows.entries()) {
          if (index < minimumOccurrences) continue;
          if (index >= maximumOccurrences || row.created_at < cutoff) {
            result.occurrences += Number(deleteOccurrence.run(row.id).changes);
          }
        }
      }

      const caseIds = this.db.prepare('SELECT id FROM regression_cases').all() as { id: string }[];
      const replayRows = this.db.prepare(
        'SELECT id FROM replay_runs WHERE case_id = ? ORDER BY created_at DESC, rowid DESC'
      );
      const deleteReplay = this.db.prepare('DELETE FROM replay_runs WHERE id = ?');
      for (const regression of caseIds) {
        const rows = replayRows.all(regression.id) as { id: string }[];
        for (const row of rows.slice(maximumReplays)) {
          result.replays += Number(deleteReplay.run(row.id).changes);
        }
      }

      const flights = this.db.prepare(
        `SELECT f.id FROM manager_flights f
         WHERE f.state IN ('completed','failed','cancelled')
           AND COALESCE(f.completed_at, f.updated_at) < ?
           AND NOT EXISTS (
             SELECT 1 FROM incidents i WHERE i.flight_id = f.id AND i.status != 'closed'
           )
           AND NOT EXISTS (
             SELECT 1 FROM incidents i JOIN regression_cases r ON r.incident_id = i.id WHERE i.flight_id = f.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM incident_occurrences o WHERE o.flight_id = f.id
           )`
      ).all(cutoff) as { id: string }[];
      const detachClosedIncident = this.db.prepare(
        `UPDATE incidents SET flight_id = NULL, stage_record_id = NULL
         WHERE flight_id = ? AND status = 'closed'
           AND NOT EXISTS (SELECT 1 FROM regression_cases r WHERE r.incident_id = incidents.id)`
      );
      const deleteStages = this.db.prepare('DELETE FROM manager_stage_records WHERE flight_id = ?');
      const deleteFlight = this.db.prepare('DELETE FROM manager_flights WHERE id = ?');
      for (const flight of flights) {
        detachClosedIncident.run(flight.id);
        result.stages += Number(deleteStages.run(flight.id).changes);
        result.flights += Number(deleteFlight.run(flight.id).changes);
      }
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  beginFlight(input: BeginFlightInput): string {
    const existing = this.db.prepare('SELECT id FROM manager_flights WHERE task_id = ?').get(input.taskId) as
      { id: string } | undefined;
    if (existing) return existing.id;
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO manager_flights
        (id, task_id, conversation_id, project_id, request_hash, model_hash, prompt_version, app_version,
         state, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planning', ?, ?)`
    ).run(
      id, input.taskId, input.conversationId, input.projectId ?? null, input.requestHash,
      input.modelHash ?? null, PROMPT_VERSION, APP_VERSION, now, now,
    );
    return id;
  }

  recordStage(input: StageInput): string {
    const flight = this.db.prepare('SELECT id FROM manager_flights WHERE task_id = ?').get(input.taskId) as
      { id: string } | undefined;
    if (!flight) throw new Error('A manager stage requires an active flight.');
    const attempt = input.attempt ?? 0;
    const existing = this.db.prepare(
      'SELECT id FROM manager_stage_records WHERE flight_id = ? AND stage = ? AND attempt = ?'
    ).get(flight.id, input.stage, attempt) as { id: string } | undefined;
    if (existing) return existing.id;
    const sequence = (this.db.prepare(
      'SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM manager_stage_records WHERE flight_id = ?'
    ).get(flight.id) as { next: number }).next;
    const id = randomUUID();
    const now = new Date().toISOString();
    const latencyMs = Math.max(0, Math.round(input.latencyMs ?? 0));
    const error = input.error === undefined ? null : cleanSummary(input.error, 2_000);
    this.db.prepare(
      `INSERT INTO manager_stage_records
        (id, flight_id, sequence, stage, attempt, status, input_refs_json, input_snapshot_json, output_json, latency_ms,
         model_hash, prompt_version, error_detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, flight.id, sequence, input.stage, attempt, error ? 'failed' : 'succeeded', stableJson(input.inputRefs),
      replaySnapshot(input.taskId, input.replayInput), input.output === undefined ? null : stableJson(input.output),
      latencyMs, input.modelHash ?? null,
      PROMPT_VERSION, error, now,
    );
    this.db.prepare(
      `UPDATE manager_flights
       SET total_latency_ms = total_latency_ms + ?, model_hash = COALESCE(?, model_hash), updated_at = ?
       WHERE id = ?`
    ).run(latencyMs, input.modelHash ?? null, now, flight.id);
    if (error) {
      this.recordIncident({
        flightId: flight.id, taskId: input.taskId, stageRecordId: id,
        kind: /valid|schema|unavailable|invented|unknown enum/i.test(error) ? 'validation_failure' : 'manager_error',
        severity: 'high', summary: `Manager ${input.stage} failed: ${error}`,
        occurrence: { stage: input.stage, attempt },
      });
    } else if (latencyMs > INTERACTIVE_LATENCY_TARGET_MS) {
      this.recordIncident({
        flightId: flight.id, taskId: input.taskId, stageRecordId: id,
        kind: 'latency', severity: 'low',
        fingerprint: automaticFingerprint('latency', `${input.stage} over target`, input.stage),
        summary: `Manager ${input.stage} exceeded the three-second optimization target.`,
        diagnostic: { target_ms: INTERACTIVE_LATENCY_TARGET_MS, latest_ms: latencyMs },
        occurrence: { stage: input.stage, latency_ms: latencyMs },
      });
    }
    return id;
  }

  recordIncident(input: IncidentInput): string {
    const now = new Date().toISOString();
    const summary = cleanSummary(input.summary);
    const fingerprint = input.fingerprint ?? automaticFingerprint(input.kind, summary);
    const existing = this.db.prepare('SELECT id FROM incidents WHERE fingerprint = ?').get(fingerprint) as
      { id: string } | undefined;
    const id = existing?.id ?? randomUUID();
    if (existing) {
      this.db.prepare(
        `UPDATE incidents SET occurrence_count = occurrence_count + 1, last_seen_at = ?, updated_at = ?,
           flight_id = COALESCE(?, flight_id), task_id = COALESCE(?, task_id), stage_record_id = COALESCE(?, stage_record_id),
           summary = ?, note = COALESCE(?, note), correction_json = COALESCE(?, correction_json),
           diagnostic_json = COALESCE(?, diagnostic_json)
         WHERE id = ?`
      ).run(
        now, now, input.flightId ?? null, input.taskId ?? null, input.stageRecordId ?? null, summary,
        input.note ?? null, input.correction === undefined ? null : stableJson(input.correction),
        input.diagnostic === undefined ? null : stableJson(input.diagnostic), id,
      );
    } else {
      this.db.prepare(
        `INSERT INTO incidents
          (id, flight_id, task_id, stage_record_id, source, kind, severity, status, fingerprint, summary,
           note, correction_json, diagnostic_json, first_seen_at, last_seen_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, input.flightId ?? null, input.taskId ?? null, input.stageRecordId ?? null,
        input.source ?? 'automatic', input.kind, input.severity ?? 'medium', fingerprint, summary,
        input.note ?? null, input.correction === undefined ? null : stableJson(input.correction),
        input.diagnostic === undefined ? null : stableJson(input.diagnostic), now, now, now,
      );
    }
    this.db.prepare(
      `INSERT INTO incident_occurrences (id, incident_id, flight_id, task_id, detail_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), id, input.flightId ?? null, input.taskId ?? null, stableJson(input.occurrence ?? {}), now);
    return id;
  }

  captureUnassignedManagerFailure(request: string, stage: ManagerStage, error: unknown): string {
    const detail = cleanSummary(error, 2_000);
    return this.recordIncident({
      kind: /valid|schema|unavailable|invented|unknown enum/i.test(detail) ? 'validation_failure' : 'manager_error',
      severity: 'high', summary: `Manager ${stage} stopped before a task could be created: ${detail}`,
      occurrence: { request_hash: hash(request), stage },
    });
  }

  captureProviderFailure(taskId: string, provider: string, error: unknown): string {
    const flight = this.db.prepare('SELECT id FROM manager_flights WHERE task_id = ?').get(taskId) as { id: string } | undefined;
    return this.recordIncident({
      flightId: flight?.id, taskId, kind: 'provider_failure', severity: 'high',
      summary: `${provider} worker failed: ${cleanSummary(error, 1_500)}`,
      occurrence: { provider },
    });
  }

  reportProblem(
    taskId: string,
    kind: IncidentKind,
    note: string,
    correction?: string | null,
  ): string {
    const task = this.db.prepare('SELECT task_id FROM task_state WHERE task_id = ?').get(taskId);
    if (!task) throw new Error('That result is no longer available to report.');
    const allowed = new Set<IncidentKind>([
      'wrong_route', 'wrong_continuity', 'wrong_memory', 'wrong_tool', 'wrong_answer', 'ux', 'other',
    ]);
    if (!allowed.has(kind)) throw new Error('Choose a valid problem type.');
    const trimmedNote = cleanSummary(note, 2_000);
    if (!trimmedNote || trimmedNote === 'Unknown failure') throw new Error('Describe what went wrong.');
    const trimmedCorrection = correction?.trim().slice(0, 4_000) || null;
    const flight = this.db.prepare('SELECT id FROM manager_flights WHERE task_id = ?').get(taskId) as { id: string } | undefined;
    const mappedStage = ({
      wrong_route: 'route', wrong_continuity: 'continuity', wrong_memory: 'memory', wrong_tool: 'execution',
      wrong_answer: 'respond', other: null, ux: null,
    } as const)[kind as 'wrong_route' | 'wrong_continuity' | 'wrong_memory' | 'wrong_tool' | 'wrong_answer' | 'other' | 'ux'];
    let replayStage: ManagerStage | null = mappedStage;
    if (kind === 'wrong_answer' && flight) {
      const supervised = this.db.prepare(
        "SELECT id FROM manager_stage_records WHERE flight_id = ? AND stage = 'supervise' ORDER BY attempt DESC LIMIT 1"
      ).get(flight.id);
      if (supervised) replayStage = 'supervise';
    }
    const selectedStage = flight ? this.db.prepare(
      replayStage
        ? 'SELECT id, stage, input_snapshot_json, output_json FROM manager_stage_records WHERE flight_id = ? AND stage = ? ORDER BY attempt DESC LIMIT 1'
        : 'SELECT id, stage, input_snapshot_json, output_json FROM manager_stage_records WHERE flight_id = ? ORDER BY sequence DESC LIMIT 1'
    ).get(...(replayStage ? [flight.id, replayStage] : [flight.id])) as
      { id: string; stage: ManagerStage; input_snapshot_json: string; output_json: string | null } | undefined : undefined;
    const incidentId = this.recordIncident({
      flightId: flight?.id, taskId, stageRecordId: selectedStage?.id,
      source: trimmedCorrection ? 'will_correction' : 'will_report', kind, severity: 'medium',
      fingerprint: hash(`will-report|${taskId}|${kind}`),
      summary: `Will reported a ${kind.replaceAll('_', ' ')} problem.`,
      note: trimmedNote,
      correction: trimmedCorrection ? { expected: trimmedCorrection } : undefined,
      occurrence: { reported_from: 'assistant_result' },
    });
    if (selectedStage && selectedStage.input_snapshot_json !== '{}') {
      const now = new Date().toISOString();
      this.db.prepare(
        `INSERT INTO regression_cases
          (id, incident_id, task_id, stage, input_snapshot_json, original_output_json, expected_note, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
         ON CONFLICT(incident_id) DO UPDATE SET expected_note = excluded.expected_note, updated_at = excluded.updated_at`
      ).run(
        randomUUID(), incidentId, taskId, selectedStage.stage, selectedStage.input_snapshot_json,
        selectedStage.output_json, trimmedCorrection, now, now,
      );
    }
    return incidentId;
  }

  replayCaseForIncident(incidentId: string): {
    id: string; incidentId: string; taskId: string; stage: ManagerStage; input: Record<string, unknown>;
  } {
    const row = this.db.prepare(
      `SELECT id, incident_id, task_id, stage, input_snapshot_json FROM regression_cases
       WHERE incident_id = ? AND status != 'disabled'`
    ).get(incidentId) as {
      id: string; incident_id: string; task_id: string; stage: ManagerStage | null; input_snapshot_json: string | null;
    } | undefined;
    if (!row?.stage || !row.input_snapshot_json) throw new Error('This incident does not have a replayable manager stage.');
    const request = (this.db.prepare(
      "SELECT content FROM conversation_messages WHERE task_id = ? AND role = 'user' ORDER BY created_at LIMIT 1"
    ).get(row.task_id) as { content: string } | undefined)?.content ??
      (this.db.prepare('SELECT request FROM conversation_route_log WHERE task_id = ? ORDER BY created_at LIMIT 1')
        .get(row.task_id) as { request: string } | undefined)?.request;
    if (!request) throw new Error('The original request is no longer available for replay.');
    const revive = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(revive);
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (record.__grover_ref === 'task_request' && record.task_id === row.task_id) return request;
        return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, revive(item)]));
      }
      return value;
    };
    return {
      id: row.id, incidentId: row.incident_id, taskId: row.task_id, stage: row.stage,
      input: revive(JSON.parse(row.input_snapshot_json)) as Record<string, unknown>,
    };
  }

  recordReplay(caseId: string, output: unknown, latencyMs: number, modelHash?: string | null): string {
    const regression = this.db.prepare(
      'SELECT incident_id, original_output_json, expected_output_json, status FROM regression_cases WHERE id = ?'
    ).get(caseId) as {
      incident_id: string; original_output_json: string | null; expected_output_json: string | null; status: string;
    } | undefined;
    if (!regression) throw new Error('That replay case is no longer available.');
    const serialized = stableJson(output);
    const status = regression.expected_output_json
      ? (serialized === regression.expected_output_json ? 'passed' : 'failed')
      : (serialized === regression.original_output_json ? 'unchanged' : 'changed');
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO replay_runs (id, case_id, model_hash, output_json, status, latency_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, caseId, modelHash ?? null, serialized, status, Math.max(0, Math.round(latencyMs)), now);
    this.db.prepare('UPDATE regression_cases SET last_result = ?, updated_at = ? WHERE id = ?').run(status, now, caseId);
    if (regression.status === 'active') {
      this.db.prepare('UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?')
        .run(status === 'passed' ? 'replay_passed' : 'open', now, regression.incident_id);
    }
    return status;
  }

  recordReplayError(caseId: string, error: unknown, modelHash?: string | null): void {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO replay_runs (id, case_id, model_hash, status, error_detail, created_at)
       VALUES (?, ?, ?, 'error', ?, ?)`
    ).run(randomUUID(), caseId, modelHash ?? null, cleanSummary(error, 2_000), now);
    this.db.prepare("UPDATE regression_cases SET last_result = 'error', updated_at = ? WHERE id = ?").run(now, caseId);
  }

  promoteLatestReplay(incidentId: string): void {
    const regression = this.db.prepare('SELECT id FROM regression_cases WHERE incident_id = ?').get(incidentId) as
      { id: string } | undefined;
    if (!regression) throw new Error('This incident does not have a replay case.');
    const replay = this.db.prepare(
      `SELECT output_json FROM replay_runs WHERE case_id = ? AND output_json IS NOT NULL
       AND status IN ('changed','unchanged','passed','failed') ORDER BY created_at DESC LIMIT 1`
    ).get(regression.id) as { output_json: string } | undefined;
    if (!replay) throw new Error('Replay this incident before approving its current behavior.');
    const now = new Date().toISOString();
    this.db.prepare(
      `UPDATE regression_cases SET expected_output_json = ?, status = 'active', last_result = 'passed', updated_at = ? WHERE id = ?`
    ).run(replay.output_json, now, regression.id);
    this.db.prepare("UPDATE incidents SET status = 'replay_passed', updated_at = ? WHERE id = ?").run(now, incidentId);
  }

  activeRegressionIncidentIds(): string[] {
    return (this.db.prepare("SELECT incident_id FROM regression_cases WHERE status = 'active' ORDER BY created_at").all() as
      { incident_id: string }[]).map((row) => row.incident_id);
  }

  updateIncidentStatus(id: string, action: 'diagnose' | 'fixed' | 'close' | 'reopen'): void {
    const status = ({ diagnose: 'diagnosed', fixed: 'fixed', close: 'closed', reopen: 'open' } as const)[action];
    if (!status) throw new Error('Unknown incident action.');
    const result = this.db.prepare('UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id);
    if (result.changes !== 1) throw new Error('That incident is no longer available.');
  }

  syncFlightStates(): void {
    const active = this.db.prepare(
      `SELECT f.id, f.task_id, t.status, t.plain_language
       FROM manager_flights f JOIN task_state t ON t.task_id = f.task_id
       WHERE f.state IN ('planning','executing','blocked')`
    ).all() as { id: string; task_id: string; status: string; plain_language: string }[];
    const now = new Date().toISOString();
    for (const flight of active) {
      const state = flight.status === 'done' ? 'completed'
        : flight.status === 'failed' ? 'failed'
        : flight.status === 'cancelled' ? 'cancelled'
        : flight.status === 'blocked' ? 'blocked'
        : flight.status === 'intake' || flight.status === 'planning' || flight.status === 'queued' ? 'planning'
        : 'executing';
      const terminal = ['completed', 'failed', 'cancelled'].includes(state);
      this.db.prepare(
        `UPDATE manager_flights SET state = ?, error_summary = ?, completed_at = CASE WHEN ? THEN ? ELSE completed_at END,
           updated_at = ? WHERE id = ?`
      ).run(state, state === 'failed' ? flight.plain_language : null, terminal ? 1 : 0, now, now, flight.id);
      if (state === 'failed') {
        this.recordIncident({
          flightId: flight.id, taskId: flight.task_id, kind: 'task_failure', severity: 'high',
          fingerprint: automaticFingerprint('task_failure', flight.plain_language),
          summary: flight.plain_language,
          occurrence: { task_id: flight.task_id },
        });
      }
    }
  }
}

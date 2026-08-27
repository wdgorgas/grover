import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { appendEvent } from './events.ts';
import type { RetrievedMemory } from './memory.ts';
import type { Context } from './store.ts';

export type ProjectRecord = {
  id: string;
  conversationId: string;
  context: Context;
  name: string;
  goal: string;
  summary: string;
  currentState: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
};

export type ProjectMemoryKind = 'goal' | 'requirement' | 'decision' | 'outcome' | 'artifact' | 'next_action' | 'status' | 'note';

function compact(value: string, max = 1_200): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

function yaml(value: unknown): string {
  return JSON.stringify(value ?? '');
}

function renderNote(row: Record<string, unknown>): string {
  return [
    '---',
    `id: ${yaml(row.id)}`,
    `project_id: ${yaml(row.project_id)}`,
    `kind: ${yaml(row.kind)}`,
    `source_task_id: ${yaml(row.source_task_id)}`,
    `provenance: ${yaml(row.provenance)}`,
    `verification: ${yaml(row.verification_state)}`,
    `importance: ${yaml(row.importance)}`,
    `expires_at: ${yaml(row.expires_at)}`,
    `created: ${yaml(row.created_at)}`,
    '---', '', String(row.content ?? ''), '',
  ].join('\n');
}

function parseNote(value: string): { metadata: Record<string, string>; content: string } | null {
  const text = value.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return null;
  const metadata: Record<string, string> = {};
  for (const line of text.slice(4, end).split('\n')) {
    const split = line.indexOf(':');
    if (split < 1) continue;
    const key = line.slice(0, split).trim();
    const raw = line.slice(split + 1).trim();
    try { metadata[key] = JSON.parse(raw); }
    catch { metadata[key] = raw; }
  }
  return { metadata, content: text.slice(end + 5).trim() };
}

function projectFromRow(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id), conversationId: String(row.conversation_id), context: row.context as Context,
    name: String(row.name), goal: String(row.goal), summary: String(row.summary), currentState: String(row.current_state),
    status: row.status as ProjectRecord['status'],
  };
}

export class ProjectMemoryService {
  readonly db: DatabaseSync;
  readonly vaultRoot: string;

  constructor(db: DatabaseSync, dataDir: string) {
    this.db = db;
    this.vaultRoot = join(dataDir, 'vault', 'will-private', 'projects');
    mkdirSync(this.vaultRoot, { recursive: true });
    this.reconcileProjectGoals();
    this.rebuildIndex();
    this.pruneExpired();
  }

  private reconcileProjectGoals(): void {
    const now = new Date().toISOString();
    const rows = this.db.prepare(
      `SELECT r.id, r.goal,
         (SELECT m.content FROM project_memories m
          WHERE m.project_id = r.id AND m.kind = 'goal' AND m.deleted_at IS NULL AND m.superseded_by IS NULL
            AND (m.expires_at IS NULL OR m.expires_at > ?)
          ORDER BY m.updated_at DESC LIMIT 1) AS memory_goal
       FROM project_records r`
    ).all(now) as { id: string; goal: string; memory_goal: string | null }[];
    const update = this.db.prepare('UPDATE project_records SET goal = ?, updated_at = ? WHERE id = ?');
    for (const row of rows) {
      if (row.memory_goal?.trim() && row.memory_goal !== row.goal) update.run(row.memory_goal, now, row.id);
    }
  }

  getByConversation(conversationId: string): ProjectRecord | null {
    const row = this.db.prepare('SELECT * FROM project_records WHERE conversation_id = ?').get(conversationId) as
      Record<string, unknown> | undefined;
    return row ? projectFromRow(row) : null;
  }

  get(id: string): ProjectRecord | null {
    const row = this.db.prepare('SELECT * FROM project_records WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? projectFromRow(row) : null;
  }

  ensureProject(conversationId: string, context: Context, name: string, goal: string, preferredId?: string | null): ProjectRecord {
    const current = this.getByConversation(conversationId);
    if (current) return current;
    const id = preferredId ?? randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO project_records
        (id, conversation_id, context, name, goal, summary, current_state, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '', ?, 'active', ?, ?)`
    ).run(id, conversationId, context, compact(name, 100), compact(goal), 'Project created; work has not completed yet.', now, now);
    this.remember(id, 'goal', compact(goal), null, 'project-intake', 'manager', 'high');
    return this.get(id)!;
  }

  private writeNote(id: string): void {
    const row = this.db.prepare('SELECT * FROM project_memories WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return;
    const folder = join(this.vaultRoot, String(row.project_id));
    mkdirSync(folder, { recursive: true });
    const path = join(folder, `${id}.md`);
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, renderNote(row), 'utf8');
    renameSync(temporary, path);
    this.db.prepare('UPDATE project_memories SET vault_path = ? WHERE id = ?').run(path, id);
  }

  private index(id: string): void {
    this.db.prepare('DELETE FROM project_memories_fts WHERE memory_id = ?').run(id);
    const row = this.db.prepare(
      `SELECT id, project_id, content FROM project_memories
       WHERE id = ? AND deleted_at IS NULL AND superseded_by IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`
    ).get(id, new Date().toISOString()) as { id: string; project_id: string; content: string } | undefined;
    if (row) this.db.prepare(
      'INSERT INTO project_memories_fts(memory_id, project_id, content) VALUES (?, ?, ?)'
    ).run(row.id, row.project_id, row.content);
  }

  rebuildIndex(): void {
    this.db.exec('DELETE FROM project_memories_fts;');
    const rows = this.db.prepare(
      `SELECT id, project_id, content FROM project_memories
       WHERE deleted_at IS NULL AND superseded_by IS NULL AND (expires_at IS NULL OR expires_at > ?)`
    ).all(new Date().toISOString()) as { id: string; project_id: string; content: string }[];
    const insert = this.db.prepare('INSERT INTO project_memories_fts(memory_id, project_id, content) VALUES (?, ?, ?)');
    for (const row of rows) insert.run(row.id, row.project_id, row.content);
  }

  remember(
    projectId: string,
    kind: ProjectMemoryKind,
    content: string,
    taskId: string | null,
    provenance: string,
    verification: 'manager' | 'worker' | 'verified' | 'user' = 'manager',
    importance: 'normal' | 'high' = 'normal',
    expiresAt?: string | null,
  ): string {
    if (!this.get(projectId)) throw new Error('That project is no longer available.');
    const value = compact(content);
    if (!value) throw new Error('Project memory cannot be empty.');
    const duplicate = this.db.prepare(
      `SELECT id FROM project_memories WHERE project_id = ? AND kind = ? AND lower(content) = lower(?)
       AND deleted_at IS NULL AND superseded_by IS NULL LIMIT 1`
    ).get(projectId, kind, value) as { id: string } | undefined;
    if (duplicate) return duplicate.id;
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO project_memories
        (id, project_id, kind, content, source_task_id, provenance, verification_state, importance,
         expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, projectId, kind, value, taskId, provenance, verification, importance, expiresAt ?? null, now, now);
    this.index(id);
    this.writeNote(id);
    appendEvent(this.db, {
      scopeType: 'memory', scopeId: id, taskId: taskId ?? undefined,
      idempotencyKey: `${id}:project-memory`, actor: verification === 'user' ? 'will' : 'grover',
      domain: this.get(projectId)?.context, phase: 'memory', plainLanguage: `Saved project ${kind.replace('_', ' ')}`,
      internalDetail: JSON.stringify({ projectId, memoryId: id, kind, provenance }),
    });
    return id;
  }

  hasMemory(id: string): boolean {
    return Boolean(this.db.prepare(
      'SELECT id FROM project_memories WHERE id = ? AND deleted_at IS NULL AND superseded_by IS NULL'
    ).get(id));
  }

  correct(id: string, content: string, taskId: string | null): string {
    const row = this.db.prepare('SELECT * FROM project_memories WHERE id = ? AND deleted_at IS NULL').get(id) as
      Record<string, unknown> | undefined;
    if (!row) throw new Error('That project memory is no longer active.');
    const replacement = this.remember(
      String(row.project_id), row.kind as ProjectMemoryKind, content, taskId,
      taskId ? `manager-correction:${id}` : `will-correction:${id}`, taskId ? 'manager' : 'user',
      row.importance === 'high' ? 'high' : 'normal', row.expires_at as string | null,
    );
    this.db.prepare('UPDATE project_memories SET superseded_by = ?, updated_at = ? WHERE id = ?')
      .run(replacement, new Date().toISOString(), id);
    if (row.kind === 'goal') {
      const replacementRow = this.db.prepare('SELECT content FROM project_memories WHERE id = ?').get(replacement) as
        { content: string };
      this.db.prepare('UPDATE project_records SET goal = ?, updated_at = ? WHERE id = ?')
        .run(replacementRow.content, new Date().toISOString(), row.project_id);
    }
    this.index(id);
    this.writeNote(id);
    return replacement;
  }

  forget(id: string): void {
    const row = this.db.prepare('SELECT vault_path FROM project_memories WHERE id = ? AND deleted_at IS NULL').get(id) as
      { vault_path: string | null } | undefined;
    if (!row) return;
    this.db.prepare("UPDATE project_memories SET content = '[deleted]', deleted_at = ?, vault_path = NULL WHERE id = ?")
      .run(new Date().toISOString(), id);
    this.index(id);
    if (row.vault_path && existsSync(row.vault_path)) rmSync(row.vault_path);
  }

  retrieve(projectId: string, query: string, limit = 12): RetrievedMemory[] {
    const safeLimit = Math.max(1, Math.min(24, Math.trunc(limit)));
    const words = [...new Set((query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []))].slice(0, 16);
    let rows: Record<string, unknown>[];
    if (words.length) {
      const match = words.map((word) => `${word.replace(/[^a-z0-9]/g, '')}*`).filter(Boolean).join(' OR ');
      rows = this.db.prepare(
        `SELECT p.* FROM project_memories_fts f JOIN project_memories p ON p.id = f.memory_id
         WHERE f.project_id = ? AND project_memories_fts MATCH ? AND p.deleted_at IS NULL AND p.superseded_by IS NULL
           AND (p.expires_at IS NULL OR p.expires_at > ?)
         ORDER BY bm25(project_memories_fts), p.updated_at DESC LIMIT ?`
      ).all(projectId, match, new Date().toISOString(), safeLimit) as Record<string, unknown>[];
    } else {
      rows = this.db.prepare(
        `SELECT * FROM project_memories WHERE project_id = ? AND deleted_at IS NULL AND superseded_by IS NULL
           AND (expires_at IS NULL OR expires_at > ?) ORDER BY updated_at DESC LIMIT ?`
      ).all(projectId, new Date().toISOString(), safeLimit) as Record<string, unknown>[];
    }
    const essentials = this.db.prepare(
      `SELECT * FROM project_memories WHERE project_id = ? AND deleted_at IS NULL AND superseded_by IS NULL
       AND kind IN ('goal','requirement','decision','outcome','next_action','status')
       AND (expires_at IS NULL OR expires_at > ?) ORDER BY updated_at DESC LIMIT ?`
    ).all(projectId, new Date().toISOString(), safeLimit) as Record<string, unknown>[];
    const selected = [...rows, ...essentials]
      .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
      .slice(0, safeLimit);
    return selected.map((row, index) => ({
      id: String(row.id), namespace: 'will-private', category: `project:${projectId}:${String(row.kind)}`,
      content: String(row.content), source: String(row.provenance), createdAt: String(row.created_at),
      score: Math.max(1, 100 - index), explanation: `Project ${String(row.kind).replace('_', ' ')} from ${String(row.provenance)}.`,
    }));
  }

  searchAll(query: string, limit = 100): Record<string, unknown>[] {
    const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
    const words = [...new Set((query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []))].slice(0, 16);
    const now = new Date().toISOString();
    const select = `SELECT p.id, p.project_id, ('project:' || r.name) AS namespace, p.kind AS category, p.content, p.provenance,
      p.verification_state AS confidence, 'private' AS sensitivity, p.importance, p.vault_path,
      p.created_at, p.updated_at, r.name AS project_name
      FROM project_memories p JOIN project_records r ON r.id = p.project_id`;
    if (!words.length) return this.db.prepare(
      `${select} WHERE p.deleted_at IS NULL AND p.superseded_by IS NULL
       AND (p.expires_at IS NULL OR p.expires_at > ?) ORDER BY p.updated_at DESC LIMIT ?`
    ).all(now, safeLimit) as Record<string, unknown>[];
    const match = words.map((word) => `${word.replace(/[^a-z0-9]/g, '')}*`).filter(Boolean).join(' OR ');
    return this.db.prepare(
      `SELECT p.id, p.project_id, ('project:' || r.name) AS namespace, p.kind AS category, p.content, p.provenance,
              p.verification_state AS confidence, 'private' AS sensitivity, p.importance, p.vault_path,
              p.created_at, p.updated_at, r.name AS project_name
       FROM project_memories_fts f JOIN project_memories p ON p.id = f.memory_id
       JOIN project_records r ON r.id = p.project_id
       WHERE project_memories_fts MATCH ? AND p.deleted_at IS NULL AND p.superseded_by IS NULL
         AND (p.expires_at IS NULL OR p.expires_at > ?) ORDER BY bm25(project_memories_fts), p.updated_at DESC LIMIT ?`
    ).all(match, now, safeLimit) as Record<string, unknown>[];
  }

  captureOutcome(projectId: string, taskId: string, answer: string): string {
    const outcome = compact(answer || 'Worker completed without a text summary.');
    const id = this.remember(projectId, 'outcome', outcome, taskId, `worker:${taskId}`, 'worker', 'high');
    this.db.prepare(
      `UPDATE project_records SET summary = ?, current_state = ?, updated_at = ? WHERE id = ?`
    ).run(outcome, `Most recent task ${taskId} completed.`, new Date().toISOString(), projectId);
    return id;
  }

  recordArtifact(projectId: string, taskId: string | null, kind: 'folder' | 'file' | 'commit' | 'report' | 'link' | 'other', uri: string, summary: string, fileHash?: string | null): string {
    const existing = this.db.prepare(
      'SELECT id FROM project_artifacts WHERE project_id = ? AND kind = ? AND uri_or_path = ?'
    ).get(projectId, kind, uri) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO project_artifacts (id, project_id, task_id, kind, uri_or_path, summary, hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, projectId, taskId, kind, uri, compact(summary, 500), fileHash ?? null, new Date().toISOString());
    this.remember(projectId, 'artifact', `${summary}: ${uri}`, taskId, `artifact:${id}`, 'verified');
    return id;
  }

  syncVault(): number {
    let changed = 0;
    for (const project of readdirSync(this.vaultRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const folder = join(this.vaultRoot, project.name);
      for (const file of readdirSync(folder).filter((name) => name.endsWith('.md'))) {
        const parsed = parseNote(readFileSync(join(folder, file), 'utf8'));
        if (!parsed?.metadata.id || parsed.metadata.project_id !== project.name || !parsed.content) continue;
        const current = this.db.prepare('SELECT content, kind, project_id FROM project_memories WHERE id = ?').get(parsed.metadata.id) as
          { content: string; kind: ProjectMemoryKind; project_id: string } | undefined;
        if (!current || current.content === parsed.content) continue;
        this.db.prepare('UPDATE project_memories SET content = ?, updated_at = ? WHERE id = ?')
          .run(parsed.content, new Date().toISOString(), parsed.metadata.id);
        if (current.kind === 'goal') {
          this.db.prepare('UPDATE project_records SET goal = ?, updated_at = ? WHERE id = ?')
            .run(parsed.content, new Date().toISOString(), current.project_id);
        }
        this.index(parsed.metadata.id);
        changed += 1;
      }
    }
    return changed;
  }

  rewriteVault(): void {
    mkdirSync(this.vaultRoot, { recursive: true });
    this.rebuildIndex();
    const rows = this.db.prepare(
      `SELECT id FROM project_memories WHERE deleted_at IS NULL AND superseded_by IS NULL
       AND (expires_at IS NULL OR expires_at > ?)`
    ).all(new Date().toISOString()) as { id: string }[];
    for (const row of rows) this.writeNote(row.id);
  }

  pruneExpired(): number {
    const now = new Date().toISOString();
    const rows = this.db.prepare(
      'SELECT id, vault_path FROM project_memories WHERE deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?'
    ).all(now) as { id: string; vault_path: string | null }[];
    for (const row of rows) {
      this.db.prepare("UPDATE project_memories SET content = '[expired]', deleted_at = ?, vault_path = NULL WHERE id = ?")
        .run(now, row.id);
      this.index(row.id);
      if (row.vault_path && existsSync(row.vault_path)) rmSync(row.vault_path);
    }
    return rows.length;
  }
}

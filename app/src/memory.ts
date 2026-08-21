import { createHash, randomUUID } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { appendEvent, appendEventInTransaction } from './events.ts';
import type { Context } from './store.ts';

type MemoryInput = {
  id?: string;
  content: string;
  namespace?: string;
  owner?: string;
  category?: string;
  confidence?: string;
  sensitivity?: string;
  importance?: string;
  source: string;
};

export type IncidentalMemoryResult = {
  kind: 'saved' | 'proposed' | 'unchanged';
  id: string;
  content: string;
};

export type RetrievedMemory = {
  id: string;
  namespace: string;
  category: string;
  content: string;
  source: string;
  createdAt: string;
  score: number;
  explanation: string;
};

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before', 'being', 'can', 'could',
  'does', 'for', 'from', 'have', 'how', 'into', 'its', 'just', 'like', 'more', 'need', 'our', 'should',
  'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'what', 'when', 'where',
  'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
]);

function transact<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function tokens(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .map((token) => token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token))];
}

function yamlValue(value: string | null | undefined): string {
  return JSON.stringify(value ?? '');
}

function renderNote(memory: Record<string, any>): string {
  return [
    '---',
    `id: ${yamlValue(memory.id)}`,
    `owner: ${yamlValue(memory.owner)}`,
    `namespace: ${yamlValue(memory.namespace)}`,
    `category: ${yamlValue(memory.category)}`,
    `confidence: ${yamlValue(memory.confidence)}`,
    `sensitivity: ${yamlValue(memory.sensitivity)}`,
    `importance: ${yamlValue(memory.importance)}`,
    `source: ${yamlValue(memory.provenance)}`,
    `created: ${yamlValue(memory.created_at)}`,
    `superseded_by: ${yamlValue(memory.superseded_by)}`,
    '---', '', memory.content, '',
  ].join('\n');
}

function parseNote(text: string): { metadata: Record<string, string>; content: string } | null {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return null;
  const metadata: Record<string, string> = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    const split = line.indexOf(':');
    if (split < 1) continue;
    const key = line.slice(0, split).trim();
    const raw = line.slice(split + 1).trim();
    try { metadata[key] = JSON.parse(raw); }
    catch { metadata[key] = raw; }
  }
  return { metadata, content: normalized.slice(end + 5).trim() };
}

export function looksLikeUntrustedInstructions(content: string): boolean {
  return /(?:\b(ignore|disregard|override|forget)\b.{0,50}\b(instruction|prompt|policy|rule)\b)|(?:\b(system prompt|developer message|act as)\b)|(?:\breveal\b.{0,30}\b(secret|credential|token|key)\b)/i.test(content);
}

export function readableNamespaces(context: Context): string[] {
  const map: Record<Context, string[]> = {
    general: ['will-private', 'shared-grover-dev', 'shared-home-tech', 'shared-business'],
    coding: ['will-private', 'shared-grover-dev'],
    research: ['will-private', 'shared-grover-dev'],
    finance: ['will-private', 'shared-business'],
    health: ['will-private'],
    business: ['will-private', 'shared-business'],
    builder: ['will-private', 'shared-grover-dev'],
  };
  // A stale or migrated event must never turn an internal namespace into an
  // application context and crash an otherwise valid request.
  return map[context] ?? map.general;
}

export class MemoryService {
  readonly db: DatabaseSync;
  readonly vaultRoot: string;

  constructor(db: DatabaseSync, dataDir: string) {
    this.db = db;
    this.vaultRoot = join(dataDir, 'vault');
    mkdirSync(this.vaultRoot, { recursive: true });
    this.rebuildIndex();
  }

  private assertNamespace(namespace: string, write = false): void {
    const row = this.db.prepare('SELECT kind, fails_closed FROM memory_namespaces WHERE id = ?').get(namespace) as
      { kind: string; fails_closed: number } | undefined;
    if (!row) throw new Error(`Unknown memory namespace: ${namespace}`);
    if (namespace === 'jackson-private' || row.fails_closed) throw new Error('jackson-private fails closed in GROVER v2.0.');
    if (write && row.kind === 'future') {
      // Future namespaces are schema-valid for forward compatibility, but no v2.0 hot path writes to them.
      throw new Error('Future life-domain memory is reserved for v2.1 and cannot be written by GROVER v2.0.');
    }
  }

  private indexMemory(id: string): void {
    this.db.prepare('DELETE FROM memories_fts WHERE memory_id = ?').run(id);
    const memory = this.db.prepare(
      `SELECT id, content, namespace FROM memories
       WHERE id = ? AND deleted_at IS NULL AND superseded_by IS NULL AND namespace != 'jackson-private'`
    ).get(id) as { id: string; content: string; namespace: string } | undefined;
    if (memory) this.db.prepare('INSERT INTO memories_fts(memory_id, content, namespace) VALUES (?, ?, ?)')
      .run(memory.id, memory.content, memory.namespace);
  }

  rebuildIndex(): void {
    this.db.exec('DELETE FROM memories_fts;');
    const current = this.db.prepare(
      `SELECT id, content, namespace FROM memories
       WHERE deleted_at IS NULL AND superseded_by IS NULL AND namespace != 'jackson-private'`
    ).all() as { id: string; content: string; namespace: string }[];
    const insert = this.db.prepare('INSERT INTO memories_fts(memory_id, content, namespace) VALUES (?, ?, ?)');
    for (const memory of current) insert.run(memory.id, memory.content, memory.namespace);
  }

  private writeNote(id: string): string {
    const memory = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!memory) throw new Error(`Unknown memory: ${id}`);
    this.assertNamespace(memory.namespace);
    const directory = join(this.vaultRoot, memory.namespace);
    mkdirSync(directory, { recursive: true });
    const path = join(directory, `${id}.md`);
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, renderNote(memory), 'utf8');
    renameSync(temporary, path);
    this.db.prepare('UPDATE memories SET vault_path = ? WHERE id = ?').run(path, id);
    return path;
  }

  remember(input: MemoryInput, allowFuture = false): string {
    const content = input.content.trim();
    if (!content) throw new Error('Memory content cannot be empty.');
    const namespace = input.namespace ?? 'will-private';
    if (allowFuture) {
      if (namespace === 'jackson-private') this.assertNamespace(namespace, true);
      const exists = this.db.prepare('SELECT id FROM memory_namespaces WHERE id = ?').get(namespace);
      if (!exists) throw new Error(`Unknown memory namespace: ${namespace}`);
    } else this.assertNamespace(namespace, true);
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    transact(this.db, () => {
      this.db.prepare(
        `INSERT INTO memories
          (id, owner, namespace, category, confidence, sensitivity, importance, content, provenance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, input.owner ?? 'will', namespace, input.category ?? 'project', input.confidence ?? 'high',
        input.sensitivity ?? 'private', input.importance ?? 'normal', content, input.source, now, now,
      );
      appendEventInTransaction(this.db, {
        scopeType: 'memory', scopeId: id, idempotencyKey: `${id}:remembered`, actor: 'will', domain: namespace,
        phase: 'memory', plainLanguage: 'Remembered a local fact',
        internalDetail: JSON.stringify({ memoryId: id, namespace, source: input.source }),
      });
    });
    this.indexMemory(id);
    this.writeNote(id);
    return id;
  }

  correct(id: string, content: string, source = 'will-correction'): string {
    const previous = this.db.prepare('SELECT * FROM memories WHERE id = ? AND deleted_at IS NULL').get(id) as Record<string, any> | undefined;
    if (!previous) throw new Error('That memory is no longer active.');
    const replacement = this.remember({
      content, namespace: previous.namespace, owner: previous.owner, category: previous.category,
      confidence: 'high', sensitivity: previous.sensitivity, importance: previous.importance,
      source: `${source}:${id}`,
    });
    const now = new Date().toISOString();
    transact(this.db, () => {
      this.db.prepare('UPDATE memories SET superseded_by = ?, updated_at = ? WHERE id = ?').run(replacement, now, id);
      appendEventInTransaction(this.db, {
        scopeType: 'memory', scopeId: id, idempotencyKey: `${id}:superseded:${replacement}`, actor: 'will',
        domain: previous.namespace, phase: 'memory', plainLanguage: 'Corrected a remembered fact',
        internalDetail: JSON.stringify({ previousMemoryId: id, replacementMemoryId: replacement }),
      });
    });
    this.indexMemory(id);
    this.writeNote(id);
    return replacement;
  }

  forget(id: string): void {
    const memory = this.db.prepare('SELECT * FROM memories WHERE id = ? AND deleted_at IS NULL').get(id) as Record<string, any> | undefined;
    if (!memory) return;
    this.assertNamespace(memory.namespace);
    const now = new Date().toISOString();
    transact(this.db, () => {
      this.db.prepare("UPDATE memories SET content = '[deleted]', deleted_at = ?, updated_at = ?, vault_path = NULL WHERE id = ?")
        .run(now, now, id);
      appendEventInTransaction(this.db, {
        scopeType: 'memory', scopeId: id, idempotencyKey: `${id}:deleted`, actor: 'will', domain: memory.namespace,
        phase: 'memory', plainLanguage: 'Deleted a remembered fact', internalDetail: JSON.stringify({ memoryId: id }),
      });
    });
    this.indexMemory(id);
    if (memory.vault_path && existsSync(memory.vault_path)) rmSync(memory.vault_path);
  }

  propose(taskId: string, content: string, sensitivity = 'private', namespace = 'will-private'): string {
    this.assertNamespace(namespace);
    const source = this.db.prepare('SELECT event_id FROM events WHERE task_id = ? ORDER BY seq LIMIT 1').get(taskId) as
      { event_id: string } | undefined;
    if (!source) throw new Error('A memory proposal needs a source event.');
    const task = this.db.prepare('SELECT domain FROM task_state WHERE task_id = ?').get(taskId) as
      { domain: Context | null } | undefined;
    const id = randomUUID();
    const now = new Date().toISOString();
    transact(this.db, () => {
      this.db.prepare(
        `INSERT INTO memory_update_proposals
          (id, source_event_id, proposed_operation, namespace, status, provenance, sensitivity, rationale, proposed_content, created_at)
         VALUES (?, ?, 'create', ?, 'proposed', ?, ?, ?, ?, ?)`
      ).run(id, source.event_id, namespace, `conversation:${taskId}`, sensitivity, 'Possible profile fact from ordinary conversation', content, now);
      appendEventInTransaction(this.db, {
        scopeType: 'memory', scopeId: id, taskId, idempotencyKey: `${id}:proposed`, actor: 'grover',
        domain: task?.domain ?? undefined,
        phase: 'memory', plainLanguage: 'Proposed a possible memory for review',
        internalDetail: JSON.stringify({ proposalId: id, sensitivity }),
      });
    });
    return id;
  }

  considerIncidental(taskId: string, text: string): IncidentalMemoryResult | null {
    const value = text.trim();
    let content: string | null = null;
    let category = 'profile';
    const name = value.match(/\bmy name is\s+([^.!?]+)/i);
    const prefer = value.match(/\bi prefer\s+([^.!?]+)/i);
    const like = value.match(/\bi like\s+([^.!?]+)/i);
    const major = value.match(/\bmy major is\s+([^.!?]+)/i);
    const goal = value.match(/\b(?:my (?:long[- ]term )?goal is|i want to become|i plan to become)\s+([^.!?]+)/i);
    const next = value.match(/\bmy next steps? (?:are|is)\s+([^.!?]+)/i);
    const education = value.match(
      /\bi(?:'m| am)\s+([^.!?]{0,100}\b(?:undergraduate|graduate student|college student|student|senior|junior|sophomore|freshman|researcher|engineer|developer)\b[^.!?]*)/i,
    );
    if (name) { content = `Will's name is ${name[1].trim()}.`; category = 'profile:name'; }
    else if (major) { content = `Will's major is ${major[1].trim()}.`; category = 'profile:major'; }
    else if (goal) { content = `Will's goal is ${goal[1].trim()}.`; category = 'profile:goal'; }
    else if (next) { content = `Will's next steps are ${next[1].trim()}.`; category = 'profile:next-steps'; }
    else if (education) { content = `Will is ${education[1].trim()}.`; category = 'profile:education-role'; }
    else if (prefer) { content = `Will prefers ${prefer[1].trim()}.`; category = 'profile:preference'; }
    else if (like) { content = `Will likes ${like[1].trim()}.`; category = 'profile:preference'; }
    if (!content) return null;
    const sensitivity = /\b(medical|diagnos|medication|symptom|health condition|income|salary|debt|account balance|bank account)\b/i.test(value)
      ? 'sensitive' : 'private';
    if (sensitivity === 'sensitive') {
      const id = this.propose(taskId, content, sensitivity);
      return { kind: 'proposed', id, content };
    }
    const duplicate = this.db.prepare(
      `SELECT id FROM memories
       WHERE namespace = 'will-private' AND lower(content) = lower(?)
         AND deleted_at IS NULL AND superseded_by IS NULL LIMIT 1`
    ).get(content) as { id: string } | undefined;
    if (duplicate) return { kind: 'unchanged', id: duplicate.id, content };
    const singleValue = new Set(['profile:name', 'profile:major', 'profile:goal', 'profile:next-steps']);
    const existing = singleValue.has(category) ? this.db.prepare(
      `SELECT id FROM memories
       WHERE namespace = 'will-private' AND category = ?
         AND deleted_at IS NULL AND superseded_by IS NULL
       ORDER BY updated_at DESC LIMIT 1`
    ).get(category) as { id: string } | undefined : undefined;
    const id = existing
      ? this.correct(existing.id, content, `auto-profile:${taskId}`)
      : this.remember({
        content, category, sensitivity, source: `conversation:${taskId}`, confidence: 'high', importance: 'normal',
      });
    return { kind: 'saved', id, content };
  }

  approveProposal(id: string): string {
    const proposal = this.db.prepare(
      "SELECT * FROM memory_update_proposals WHERE id = ? AND status = 'proposed'"
    ).get(id) as Record<string, any> | undefined;
    if (!proposal?.proposed_content) throw new Error('That memory proposal is no longer pending.');
    const memoryId = this.remember({
      content: proposal.proposed_content, namespace: proposal.namespace, source: `approved:${proposal.provenance}`,
      sensitivity: proposal.sensitivity, category: 'profile',
    });
    this.db.prepare("UPDATE memory_update_proposals SET status = 'applied', applied_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    return memoryId;
  }

  autoApplyEligibleProposals(): number {
    const proposals = this.db.prepare(
      `SELECT * FROM memory_update_proposals
       WHERE status = 'proposed' AND sensitivity != 'sensitive'
       ORDER BY created_at`
    ).all() as Record<string, any>[];
    let applied = 0;
    for (const proposal of proposals) {
      const content = String(proposal.proposed_content ?? '').trim();
      const standardProfile = /^(?:Will's (?:name|major|goal|next steps)|Will (?:prefers|likes))\b/i.test(content);
      const durableRole = /^Will is\b.*\b(?:undergraduate|graduate student|college student|student|senior|junior|sophomore|freshman|researcher|engineer|developer|grad school)\b/i.test(content);
      if (!standardProfile && !durableRole) continue;
      const duplicate = this.db.prepare(
        `SELECT id FROM memories WHERE namespace = ? AND lower(content) = lower(?)
         AND deleted_at IS NULL AND superseded_by IS NULL LIMIT 1`
      ).get(proposal.namespace, content) as { id: string } | undefined;
      if (!duplicate) {
        const category = /^Will's name\b/i.test(content) ? 'profile:name'
          : /^Will's major\b/i.test(content) ? 'profile:major'
          : /^Will's goal\b/i.test(content) ? 'profile:goal'
          : /^Will's next steps\b/i.test(content) ? 'profile:next-steps'
          : /^Will is\b/i.test(content) ? 'profile:education-role'
          : 'profile:preference';
        this.remember({
          content, namespace: proposal.namespace, source: `auto-policy:${proposal.provenance}`,
          sensitivity: proposal.sensitivity, category,
        });
      }
      this.db.prepare("UPDATE memory_update_proposals SET status = 'applied', applied_at = ? WHERE id = ?")
        .run(new Date().toISOString(), proposal.id);
      applied += 1;
    }
    return applied;
  }

  search(query: string, limit = 100): Record<string, any>[] {
    const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
    const queryTokens = tokens(query);
    if (!queryTokens.length) {
      return this.db.prepare(
        `SELECT id, owner, namespace, category, confidence, sensitivity, importance, content, provenance,
                vault_path, created_at, updated_at
         FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL
         ORDER BY updated_at DESC LIMIT ?`
      ).all(safeLimit) as Record<string, any>[];
    }
    const match = queryTokens.map((token) => `${token.replace(/[^a-z0-9]/g, '')}*`).filter(Boolean).join(' OR ');
    return this.db.prepare(
      `SELECT m.id, m.owner, m.namespace, m.category, m.confidence, m.sensitivity, m.importance,
              m.content, m.provenance, m.vault_path, m.created_at, m.updated_at
       FROM memories_fts f JOIN memories m ON m.id = f.memory_id
       WHERE memories_fts MATCH ? AND m.namespace != 'jackson-private'
         AND m.deleted_at IS NULL AND m.superseded_by IS NULL
       ORDER BY bm25(memories_fts), m.updated_at DESC LIMIT ?`
    ).all(match, safeLimit) as Record<string, any>[];
  }

  rejectProposal(id: string): void {
    this.db.prepare("UPDATE memory_update_proposals SET status = 'rejected' WHERE id = ? AND status = 'proposed'").run(id);
  }

  retrieve(query: string, context: Context, maxChars = 4_000, maxItems = 8): RetrievedMemory[] {
    const queryTokens = tokens(query);
    if (!queryTokens.length || maxChars <= 0 || maxItems <= 0) return [];
    const namespaces = readableNamespaces(context).filter((namespace) => namespace !== 'jackson-private');
    const match = queryTokens.map((token) => `${token.replace(/[^a-z0-9]/g, '')}*`).filter(Boolean).join(' OR ');
    const placeholders = namespaces.map(() => '?').join(',');
    const rows = this.db.prepare(
      `SELECT m.*, bm25(memories_fts) AS fts_rank
       FROM memories_fts JOIN memories m ON m.id = memories_fts.memory_id
       WHERE memories_fts MATCH ? AND m.namespace IN (${placeholders})
         AND m.deleted_at IS NULL AND m.superseded_by IS NULL
       LIMIT 100`
    ).all(match, ...namespaces) as Record<string, any>[];
    const ranked = rows.filter((row) => !looksLikeUntrustedInstructions(row.content)).map((row) => {
      const memoryTokens = new Set(tokens(row.content));
      const overlap = queryTokens.filter((token) => memoryTokens.has(token)).length;
      return { row, overlap, score: overlap * 100 - Number(row.fts_rank ?? 0) };
    }).filter((item) => item.overlap > 0).sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
    const selected: RetrievedMemory[] = [];
    let used = 0;
    for (const item of ranked) {
      const cost = item.row.content.length + 160;
      if (selected.length >= maxItems || used + cost > maxChars) continue;
      used += cost;
      selected.push({
        id: item.row.id,
        namespace: item.row.namespace,
        category: item.row.category,
        content: item.row.content,
        source: item.row.provenance,
        createdAt: item.row.created_at,
        score: item.score,
        explanation: `Remembered from ${item.row.provenance} on ${item.row.created_at}`,
      });
    }
    return selected;
  }

  syncVault(namespace: string): number {
    this.assertNamespace(namespace);
    const directory = join(this.vaultRoot, namespace);
    if (!existsSync(directory)) return 0;
    let changed = 0;
    for (const name of readdirSync(directory).filter((file) => file.endsWith('.md'))) {
      const path = join(directory, name);
      const parsed = parseNote(readFileSync(path, 'utf8'));
      const id = parsed?.metadata.id || basename(name, '.md');
      if (!parsed || !id) continue;
      const current = this.db.prepare('SELECT content FROM memories WHERE id = ? AND deleted_at IS NULL').get(id) as
        { content: string } | undefined;
      if (!current || current.content === parsed.content) continue;
      const now = new Date().toISOString();
      transact(this.db, () => {
        this.db.prepare('UPDATE memories SET content = ?, updated_at = ?, vault_path = ? WHERE id = ?')
          .run(parsed.content, now, path, id);
        appendEventInTransaction(this.db, {
          scopeType: 'memory', scopeId: id, idempotencyKey: `${id}:external-edit:${createHash('sha256').update(parsed.content).digest('hex')}`,
          actor: 'will', domain: namespace, phase: 'memory', plainLanguage: 'Synchronized a human-edited vault note',
          internalDetail: JSON.stringify({ memoryId: id, path }),
        });
      });
      this.indexMemory(id);
      changed += 1;
    }
    return changed;
  }

  consolidate(namespace: string): Record<string, any>[] {
    this.assertNamespace(namespace);
    const memories = this.db.prepare(
      'SELECT id, category, content FROM memories WHERE namespace = ? AND deleted_at IS NULL AND superseded_by IS NULL ORDER BY id'
    ).all(namespace) as { id: string; category: string; content: string }[];
    const proposals: { kind: 'merge' | 'conflict'; memoryIds: string[]; suggested: string | null; rationale: string }[] = [];
    const byContent = new Map<string, typeof memories>();
    for (const memory of memories) {
      const key = memory.content.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      byContent.set(key, [...(byContent.get(key) ?? []), memory]);
    }
    const duplicateIds = new Set<string>();
    for (const group of byContent.values()) {
      if (group.length < 2) continue;
      group.forEach((memory) => duplicateIds.add(memory.id));
      proposals.push({ kind: 'merge', memoryIds: group.map((memory) => memory.id), suggested: group[0].content, rationale: 'Exact normalized duplicate facts' });
    }
    const keyed = new Map<string, typeof memories>();
    for (const memory of memories.filter((item) => item.category.startsWith('fact:') && !duplicateIds.has(item.id))) {
      keyed.set(memory.category, [...(keyed.get(memory.category) ?? []), memory]);
    }
    for (const group of keyed.values()) {
      if (group.length < 2 || new Set(group.map((item) => item.content)).size < 2) continue;
      proposals.push({ kind: 'conflict', memoryIds: group.map((memory) => memory.id), suggested: null, rationale: 'Conflicting values for the same fact key require human resolution' });
    }
    this.db.prepare("DELETE FROM memory_consolidation_proposals WHERE namespace = ? AND status = 'proposed'").run(namespace);
    const now = new Date().toISOString();
    for (const proposal of proposals) {
      this.db.prepare(
        `INSERT INTO memory_consolidation_proposals
          (id, namespace, kind, memory_ids, suggested_content, rationale, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)`
      ).run(randomUUID(), namespace, proposal.kind, JSON.stringify(proposal.memoryIds), proposal.suggested, proposal.rationale, now);
    }
    return this.db.prepare(
      "SELECT * FROM memory_consolidation_proposals WHERE namespace = ? AND status = 'proposed' ORDER BY kind, id"
    ).all(namespace) as Record<string, any>[];
  }

  exportTo(destination: string): { id: string; path: string; hash: string; memoryCount: number } {
    mkdirSync(destination, { recursive: true });
    const exportRoot = join(destination, `grover-memory-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
    mkdirSync(exportRoot, { recursive: false });
    const rows = this.db.prepare(
      "SELECT * FROM memories WHERE namespace != 'jackson-private' ORDER BY namespace, id"
    ).all() as Record<string, any>[];
    const namespaces = this.db.prepare(
      "SELECT * FROM memory_namespaces WHERE id != 'jackson-private' ORDER BY id"
    ).all();
    const payload = JSON.stringify({ version: 1, createdAt: new Date().toISOString(), namespaces, memories: rows }, null, 2);
    writeFileSync(join(exportRoot, 'memory-export.json'), payload, 'utf8');
    const vaultDestination = join(exportRoot, 'vault');
    mkdirSync(vaultDestination);
    for (const namespace of namespaces as { id: string }[]) {
      const source = join(this.vaultRoot, namespace.id);
      if (existsSync(source)) cpSync(source, join(vaultDestination, namespace.id), { recursive: true });
    }
    const hash = createHash('sha256').update(payload).digest('hex');
    writeFileSync(join(exportRoot, 'manifest.json'), JSON.stringify({ version: 1, sha256: hash }, null, 2), 'utf8');
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      "INSERT INTO memory_exports(id, path, created_at, hash, status) VALUES (?, ?, ?, ?, 'complete')"
    ).run(id, exportRoot, now, hash);
    this.db.prepare(
      `INSERT INTO backup_health(domain, last_success_at, location, latest_hash, pending_warning, updated_at)
       VALUES ('memory', ?, ?, ?, NULL, ?)
       ON CONFLICT(domain) DO UPDATE SET
         last_success_at = excluded.last_success_at, location = excluded.location,
         latest_hash = excluded.latest_hash, pending_warning = NULL, updated_at = excluded.updated_at`
    ).run(now, exportRoot, hash, now);
    appendEvent(this.db, {
      scopeType: 'memory', scopeId: id, idempotencyKey: `${id}:exported`, actor: 'will', domain: 'memory',
      phase: 'memory', plainLanguage: 'Created a local memory backup',
      internalDetail: JSON.stringify({ exportId: id, path: exportRoot, hash, memoryCount: rows.length }),
    });
    return { id, path: exportRoot, hash, memoryCount: rows.length };
  }

  restoreFrom(exportRoot: string): { restored: number; preRestoreBackup: string; hash: string } {
    const resolvedRoot = resolve(exportRoot);
    const payloadPath = join(resolvedRoot, 'memory-export.json');
    const manifestPath = join(resolvedRoot, 'manifest.json');
    if (!existsSync(payloadPath) || !existsSync(manifestPath)) return this.rejectRestore('Choose a GROVER memory backup folder containing memory-export.json and manifest.json.');
    const payloadText = readFileSync(payloadPath, 'utf8');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: number; sha256?: string };
    const hash = createHash('sha256').update(payloadText).digest('hex');
    if (manifest.version !== 1 || manifest.sha256 !== hash) return this.rejectRestore('That memory backup failed its integrity check and was not restored.');
    const payload = JSON.parse(payloadText) as { version?: number; namespaces?: Record<string, any>[]; memories?: Record<string, any>[] };
    if (payload.version !== 1 || !Array.isArray(payload.namespaces) || !Array.isArray(payload.memories)) {
      return this.rejectRestore('That folder does not contain a supported GROVER memory backup.');
    }
    if (payload.namespaces.some((item) => item.id === 'jackson-private') || payload.memories.some((item) => item.namespace === 'jackson-private')) {
      return this.rejectRestore('A backup containing jackson-private cannot be restored by GROVER v2.0.');
    }
    const known = new Set((this.db.prepare("SELECT id FROM memory_namespaces WHERE id != 'jackson-private'").all() as { id: string }[]).map((row) => row.id));
    for (const memory of payload.memories) {
      if (!memory.id || !memory.content || !known.has(memory.namespace)) return this.rejectRestore('The backup contains an invalid or unknown memory record.');
    }

    const backupRoot = join(dirname(this.vaultRoot), 'backups');
    const preRestore = this.exportTo(backupRoot);
    try {
      transact(this.db, () => {
        this.db.prepare("DELETE FROM memories WHERE namespace != 'jackson-private'").run();
        const insert = this.db.prepare(
          `INSERT INTO memories
            (id, owner, namespace, category, confidence, sensitivity, importance, content, provenance,
             vault_path, created_at, updated_at, superseded_by, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
        );
        for (const memory of payload.memories!) {
          insert.run(
            memory.id, memory.owner ?? 'will', memory.namespace, memory.category ?? 'project',
            memory.confidence ?? 'high', memory.sensitivity ?? 'private', memory.importance ?? 'normal',
            memory.content, memory.provenance ?? 'restored-backup', memory.created_at, memory.updated_at,
            memory.superseded_by ?? null, memory.deleted_at ?? null,
          );
        }
      });
      for (const namespace of known) {
        const directory = resolve(this.vaultRoot, namespace);
        const relativePath = relative(resolve(this.vaultRoot), directory);
        if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
          throw new Error('Refused an unsafe vault restore path.');
        }
        if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
      }
      this.rebuildIndex();
      const active = this.db.prepare(
        "SELECT id FROM memories WHERE namespace != 'jackson-private' AND deleted_at IS NULL"
      ).all() as { id: string }[];
      for (const memory of active) this.writeNote(memory.id);
      const now = new Date().toISOString();
      this.db.prepare(
        `INSERT INTO backup_health(domain, last_success_at, last_restore_drill_at, location, latest_hash, pending_warning, updated_at)
         VALUES ('memory', ?, ?, ?, ?, NULL, ?)
         ON CONFLICT(domain) DO UPDATE SET last_restore_drill_at = excluded.last_restore_drill_at,
           location = excluded.location, latest_hash = excluded.latest_hash, pending_warning = NULL, updated_at = excluded.updated_at`
      ).run(now, now, resolvedRoot, hash, now);
      this.db.prepare("UPDATE memory_exports SET status = 'restored', restored_at = ? WHERE path = ?").run(now, resolvedRoot);
      appendEvent(this.db, {
        scopeType: 'memory', scopeId: hash, idempotencyKey: `restore:${hash}:${now}`, actor: 'will', domain: 'memory',
        phase: 'memory', plainLanguage: 'Restored and verified a local memory backup',
        internalDetail: JSON.stringify({ path: resolvedRoot, hash, restored: payload.memories.length, preRestoreBackup: preRestore.path }),
      });
      return { restored: payload.memories.length, preRestoreBackup: preRestore.path, hash };
    } catch (error) {
      const now = new Date().toISOString();
      this.db.prepare(
        `INSERT INTO backup_health(domain, pending_warning, updated_at) VALUES ('memory', ?, ?)
         ON CONFLICT(domain) DO UPDATE SET pending_warning = excluded.pending_warning, updated_at = excluded.updated_at`
      ).run(String(error), now);
      throw error;
    }
  }

  backupStatus(): { green: boolean; reason: string; lastBackup: string | null; lastRestore: string | null; location: string | null } {
    const row = this.db.prepare("SELECT * FROM backup_health WHERE domain = 'memory'").get() as Record<string, any> | undefined;
    if (!row) return { green: false, reason: 'No backup has been created yet.', lastBackup: null, lastRestore: null, location: null };
    const now = Date.now();
    const freshBackup = row.last_success_at && now - Date.parse(row.last_success_at) <= 24 * 60 * 60 * 1_000;
    const currentRestoreDrill = row.last_restore_drill_at && now - Date.parse(row.last_restore_drill_at) <= 30 * 24 * 60 * 60 * 1_000;
    const reachable = row.location && existsSync(row.location);
    const green = Boolean(freshBackup && currentRestoreDrill && reachable && !row.pending_warning);
    const reason = green ? 'Backup is current and the restore drill passed.'
      : row.pending_warning ? `Backup warning: ${row.pending_warning}`
      : !freshBackup ? 'The latest backup is missing or older than 24 hours.'
      : !currentRestoreDrill ? 'A restore drill has not passed in the current review window.'
      : 'The backup location is not reachable.';
    return { green, reason, lastBackup: row.last_success_at ?? null, lastRestore: row.last_restore_drill_at ?? null, location: row.location ?? null };
  }

  private rejectRestore(message: string): never {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO backup_health(domain, pending_warning, updated_at) VALUES ('memory', ?, ?)
       ON CONFLICT(domain) DO UPDATE SET pending_warning = excluded.pending_warning, updated_at = excluded.updated_at`
    ).run(message, now);
    throw new Error(message);
  }
}

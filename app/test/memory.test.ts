import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GroverCore } from '../src/core.ts';
import { openDb } from '../src/db.ts';
import { EngineRouter, type EngineRunOptions, type ExecutionEngine } from '../src/engine.ts';
import { MemoryService } from '../src/memory.ts';
import { createTask, snapshot } from '../src/store.ts';

class ImmediateEngine implements ExecutionEngine {
  readonly id = 'codex-cli';
  readonly displayName = 'Test Codex';
  readonly capabilities = ['ask', 'work', 'build'] as const;
  readonly available = true;
  async run(_options: EngineRunOptions) { return { answer: 'ok', costUsd: 0 }; }
  cancel() { return true; }
}

function memoryFixture(file = false) {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-memory-'));
  const db = openDb(file ? join(dataDir, 'grover.db') : ':memory:');
  const memory = new MemoryService(db, dataDir);
  return { dataDir, db, memory };
}

test('1 persistence across restart retains content and provenance', () => {
  const { dataDir, db, memory } = memoryFixture(true);
  memory.remember({ id: 'persisted', content: 'GROVER runs locally on Windows.', source: 'direct:test' });
  db.close();
  const reopened = openDb(join(dataDir, 'grover.db'));
  const service = new MemoryService(reopened, dataDir);
  const result = service.retrieve('locally Windows', 'general');
  assert.equal(result[0].id, 'persisted');
  assert.equal(result[0].source, 'direct:test');
  reopened.close();
});

test('2 high-confidence profile facts save automatically while sensitive facts still require review', async () => {
  const { dataDir, db } = memoryFixture();
  const core = new GroverCore({
    db, dataDir, workspaceRoot: resolve(import.meta.dirname, '..', '..'),
    router: new EngineRouter([new ImmediateEngine()]),
  });
  core.submit({ text: 'hi, my name is Will' });
  let state = core.getSnapshot() as any;
  assert.equal(state.memories.length, 1);
  assert.equal(state.memoryProposals.length, 0);
  assert.match(state.memories[0].content, /name is Will/i);

  core.submit({ text: 'I prefer medication reminders at breakfast' });
  state = core.getSnapshot() as any;
  assert.equal(state.memories.length, 1);
  assert.equal(state.memoryProposals.length, 1);
  assert.match(state.memoryProposals[0].proposed_content, /medication reminders/i);

  core.submit({ text: 'Please explain this ordinary throwaway sentence' });
  state = core.getSnapshot() as any;
  assert.equal(state.memories.length, 1, 'ordinary conversation is not copied into the vault');
  assert.equal(state.memoryProposals.length, 1);
});

test('previous safe profile proposals auto-apply once under the new memory policy', () => {
  const { db, memory } = memoryFixture();
  const taskId = createTask(db, 'ask', 'my major is computer science', 'general');
  memory.propose(taskId, "Will's major is computer science.");
  assert.equal(memory.autoApplyEligibleProposals(), 1);
  assert.equal(memory.autoApplyEligibleProposals(), 0, 'startup migration is idempotent');
  const state = snapshot(db) as any;
  assert.equal(state.memoryProposals.length, 0);
  assert.match(state.memories[0].content, /computer science/i);
});

test('durable education and role statements auto-save without accepting transient I-am facts', () => {
  const { db, memory } = memoryFixture();
  const durableTask = createTask(db, 'ask', 'I am a physics undergraduate looking at grad schools', 'general');
  const durable = memory.considerIncidental(durableTask, 'I am a physics undergraduate looking at grad schools');
  assert.equal(durable?.kind, 'saved');
  assert.match((snapshot(db) as any).memories[0].content, /physics undergraduate/i);

  const transientTask = createTask(db, 'ask', 'I am tired today', 'general');
  assert.equal(memory.considerIncidental(transientTask, 'I am tired today'), null);
  assert.equal((snapshot(db) as any).memories.length, 1);
});

test('memory snapshots stay bounded while indexed search reaches older records', () => {
  const { db, memory } = memoryFixture();
  const insert = db.prepare(
    `INSERT INTO memories(id, owner, namespace, category, confidence, sensitivity, importance, content, provenance, created_at, updated_at)
     VALUES (?, 'will', 'will-private', 'profile:preference', 'high', 'private', 'normal', ?, 'scale-test', ?, ?)`
  );
  for (let index = 0; index < 260; index += 1) {
    const time = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
    insert.run(`scale-${index}`, `Scale memory ${index}${index === 0 ? ' ancient-needle' : ''}.`, time, time);
  }
  memory.rebuildIndex();
  const state = snapshot(db) as any;
  assert.equal(state.memoryTotal, 260);
  assert.equal(state.memories.length, 200);
  assert.equal(memory.search('ancient needle')[0].id, 'scale-0');
});

test('3 correction supersedes the old fact without retrieving it as current', () => {
  const { db, memory } = memoryFixture();
  const oldId = memory.remember({ id: 'old-editor', content: 'Will prefers Editor Alpha.', category: 'fact:editor', source: 'direct:test' });
  const newId = memory.correct(oldId, 'Will prefers Editor Beta.');
  assert.deepEqual(memory.retrieve('Editor Beta', 'general').map((item) => item.id), [newId]);
  assert.equal(memory.retrieve('Alpha', 'general').length, 0);
  const old = db.prepare('SELECT superseded_by, deleted_at FROM memories WHERE id = ?').get(oldId) as any;
  assert.equal(old.superseded_by, newId);
  assert.equal(old.deleted_at, null);
});

test('4 deletion removes content and vault file while retaining an audit tombstone', () => {
  const { db, memory } = memoryFixture();
  const id = memory.remember({ id: 'delete-me', content: 'Temporary project codename Juniper.', source: 'direct:test' });
  const path = (db.prepare('SELECT vault_path FROM memories WHERE id = ?').get(id) as any).vault_path;
  assert.ok(existsSync(path));
  memory.forget(id);
  assert.equal(memory.retrieve('codename Juniper', 'general').length, 0);
  assert.equal(existsSync(path), false);
  const row = db.prepare('SELECT content, deleted_at FROM memories WHERE id = ?').get(id) as any;
  assert.equal(row.content, '[deleted]');
  assert.ok(row.deleted_at);
  assert.ok(db.prepare("SELECT 1 FROM events WHERE scope_id = ? AND plain_language = 'Deleted a remembered fact'").get(id));
});

test('5 namespace isolation and jackson-private fail closed', () => {
  const { db, dataDir, memory } = memoryFixture();
  assert.throws(() => memory.remember({ content: 'Forbidden', namespace: 'jackson-private', source: 'test' }), /fails closed/);
  db.prepare(
    `INSERT INTO memories(id, owner, namespace, category, confidence, sensitivity, importance, content, provenance, created_at, updated_at)
     VALUES ('forced-jackson','jackson','jackson-private','project','high','private','normal','Jackson prefers cloud tools','seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
  ).run();
  const rebuilt = new MemoryService(db, dataDir);
  assert.equal(rebuilt.retrieve('Jackson cloud tools', 'general').length, 0);
});

test('6 relevance eval passes twenty deterministic include/exclude scenarios', () => {
  const { db, dataDir, memory } = memoryFixture();
  const seed = [
    ['m_local','will-private','Will prefers local Windows desktop applications.'],
    ['m_codex','will-private','Codex is the preferred coding agent.'],
    ['m_sqlite','shared-grover-dev','GROVER stores authoritative state in SQLite.'],
    ['m_shift','will-private','Shift Enter inserts a newline.'],
    ['m_portable','will-private','The portable build runs without a browser.'],
    ['m_claude','shared-grover-dev','Claude is the fallback checker.'],
    ['m_budget','shared-grover-dev','Budgets use integer microdollars.'],
    ['m_p3','shared-grover-dev','P3 Builder reliability passed.'],
    ['m_delete','shared-grover-dev','Memory deletion removes facts from active retrieval.'],
    ['m_server','will-private','Server deployment is deferred.'],
    ['m_finance','will-private','Finance routes quantitative work.'],
    ['m_revenue','shared-business','The business revenue target is private.'],
    ['m_home','shared-home-tech','The home router model is Cedar.'],
    ['m_visual','will-private','Visual polish is deferred until functionality is complete.'],
    ['m_windows','will-private','The application runs locally on Windows.'],
  ];
  for (const [id, namespace, content] of seed) memory.remember({ id, namespace, content, source: 'eval-seed' });
  memory.remember({ id: 'm_future', namespace: 'life-health', content: 'Future health goal is a marathon.', source: 'eval-seed' }, true);
  db.prepare(
    `INSERT INTO memories(id, owner, namespace, category, confidence, sensitivity, importance, content, provenance, created_at, updated_at)
     VALUES ('m_jackson','jackson','jackson-private','project','high','private','normal','Jackson prefers cloud tools.','eval-seed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
  ).run();
  memory.rebuildIndex();
  const cases = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'memory-retrieval-eval.json'), 'utf8')) as any[];
  assert.equal(cases.length, 20);
  for (const scenario of cases) {
    const ids = new Set(memory.retrieve(scenario.query, scenario.context).map((item) => item.id));
    for (const id of scenario.included) assert.ok(ids.has(id), `${scenario.id} should include ${id}; got ${[...ids]}`);
    for (const id of scenario.excluded) assert.ok(!ids.has(id), `${scenario.id} should exclude ${id}; got ${[...ids]}`);
  }
});

test('7 provenance explanation names source and date', () => {
  const { memory } = memoryFixture();
  memory.remember({ id: 'why', content: 'The desktop build is the primary delivery target.', source: 'direct:task-123' });
  const result = memory.retrieve('desktop primary delivery', 'general')[0];
  assert.match(result.explanation, /direct:task-123/);
  assert.match(result.explanation, /\d{4}-\d{2}-\d{2}/);
});

test('8 vault note is human-readable and external edits synchronize back', () => {
  const { db, memory } = memoryFixture();
  const id = memory.remember({ id: 'editable', content: 'The project codename is Birch.', source: 'direct:test' });
  const path = (db.prepare('SELECT vault_path FROM memories WHERE id = ?').get(id) as any).vault_path;
  const note = readFileSync(path, 'utf8');
  assert.match(note, /^---\n/);
  assert.match(note, /namespace: "will-private"/);
  assert.match(note, /source: "direct:test"/);
  writeFileSync(path, note.replace('The project codename is Birch.', 'The project codename is Maple.'), 'utf8');
  assert.equal(memory.syncVault('will-private'), 1);
  assert.equal(memory.retrieve('codename Maple', 'general')[0].id, id);
});

test('9 consolidation proposes duplicate merges and flags conflicts for a human', () => {
  const { memory } = memoryFixture();
  memory.remember({ id: 'dup-a', content: 'Use SQLite for authoritative state.', source: 'seed' });
  memory.remember({ id: 'dup-b', content: 'Use SQLite for authoritative state.', source: 'seed' });
  memory.remember({ id: 'conflict-a', content: 'Will prefers Editor Alpha.', category: 'fact:editor', source: 'seed' });
  memory.remember({ id: 'conflict-b', content: 'Will prefers Editor Beta.', category: 'fact:editor', source: 'seed' });
  const proposals = memory.consolidate('will-private');
  assert.equal(proposals.filter((item) => item.kind === 'merge').length, 1);
  const conflict = proposals.find((item) => item.kind === 'conflict');
  assert.ok(conflict);
  assert.equal(conflict.suggested_content, null);
  assert.match(conflict.rationale, /human resolution/);
});

test('10 context budget ranks and trims instead of dumping the vault', () => {
  const { memory } = memoryFixture();
  for (let index = 0; index < 12; index += 1) {
    memory.remember({ id: `budget-${index}`, content: `Alpha project detail ${index} ${'x'.repeat(120)}`, source: 'seed' });
  }
  const result = memory.retrieve('Alpha project detail', 'general', 650, 8);
  assert.ok(result.length > 0 && result.length < 12);
  assert.ok(result.reduce((total, item) => total + item.content.length + 160, 0) <= 650);
});

test('11 future life namespace needs no migration, stays out of Builder retrieval, and exports', () => {
  const { dataDir, memory } = memoryFixture();
  memory.remember({ id: 'future-life', namespace: 'life-health', content: 'Future health preference for v2.1.', source: 'forward-test' }, true);
  assert.equal(memory.retrieve('future health preference', 'builder').length, 0);
  const destination = mkdtempSync(join(tmpdir(), 'grover-memory-export-'));
  const exported = memory.exportTo(destination);
  const payload = JSON.parse(readFileSync(join(exported.path, 'memory-export.json'), 'utf8'));
  assert.ok(payload.namespaces.some((namespace: any) => namespace.id === 'life-health'));
  assert.ok(payload.memories.some((item: any) => item.id === 'future-life'));
  assert.ok(!payload.namespaces.some((namespace: any) => namespace.id === 'jackson-private'));
  assert.ok(existsSync(join(dataDir, 'vault', 'life-health', 'future-life.md')));
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openDb } from '../src/db.ts';
import { MemoryService } from '../src/memory.ts';
import { ProjectMemoryService } from '../src/project-memory.ts';
import { createConversation } from '../src/store.ts';

test('project goal, requirements, outcome, and artifact persist separately from profile memory', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-project-memory-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const service = new ProjectMemoryService(db, dataDir);
  const conversationId = createConversation(db, 'coding', 'Tic-tac-toe');
  const project = service.ensureProject(conversationId, 'coding', 'Tic-tac-toe', 'Build a local tic-tac-toe game.');
  const requirementId = service.remember(
    project.id, 'requirement', 'The game must support two local players.', 'task-1', 'manager:task-1', 'manager', 'high',
  );
  service.captureOutcome(project.id, 'task-2', 'Implemented the board and winner detection.');
  const folder = join(dataDir, 'projects', 'tic-tac-toe');
  service.recordArtifact(project.id, 'task-2', 'folder', folder, 'Coding project folder');
  const memories = service.retrieve(project.id, 'What happened with tic tac toe?', 20);
  assert.ok(memories.some((memory) => memory.category.endsWith(':goal')));
  assert.ok(memories.some((memory) => /winner detection/i.test(memory.content)));
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM memories').get() as { count: number }).count, 0,
    'project history did not become a global profile fact');
  const note = db.prepare('SELECT vault_path FROM project_memories WHERE id = ?').get(requirementId) as { vault_path: string };
  assert.equal(existsSync(note.vault_path), true);
  assert.match(readFileSync(note.vault_path, 'utf8'), /project_id:/);
});

test('project retrieval is isolated, correctable, externally editable, and expires short-term state', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-project-isolation-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const service = new ProjectMemoryService(db, dataDir);
  const first = service.ensureProject(createConversation(db, 'coding', 'Alpha'), 'coding', 'Alpha', 'Build Alpha.');
  const second = service.ensureProject(createConversation(db, 'research', 'Beta'), 'research', 'Beta', 'Research Beta.');
  const alphaId = service.remember(first.id, 'decision', 'Use SQLite for Alpha.', 'task-a', 'manager:task-a');
  service.remember(second.id, 'decision', 'Use CSV for Beta.', 'task-b', 'manager:task-b');
  assert.equal(service.retrieve(first.id, 'storage', 20).some((memory) => /CSV/.test(memory.content)), false);
  const replacement = service.correct(alphaId, 'Use SQLite WAL mode for Alpha.', null);
  assert.equal(service.retrieve(first.id, 'SQLite', 20).some((memory) => memory.id === alphaId), false);
  const path = (db.prepare('SELECT vault_path FROM project_memories WHERE id = ?').get(replacement) as { vault_path: string }).vault_path;
  const edited = readFileSync(path, 'utf8').replace('Use SQLite WAL mode for Alpha.', 'Use SQLite WAL mode with backups for Alpha.');
  writeFileSync(path, edited, 'utf8');
  assert.equal(service.syncVault(), 1);
  assert.ok(service.retrieve(first.id, 'backups', 20).some((memory) => /with backups/.test(memory.content)));
  const expired = service.remember(
    first.id, 'status', 'Temporary experiment is running.', 'task-c', 'manager:task-c', 'manager', 'normal',
    new Date(Date.now() - 1_000).toISOString(),
  );
  assert.equal(service.pruneExpired(), 1);
  assert.equal(service.hasMemory(expired), false);
});

test('project goal corrections and vault edits keep the durable project identity synchronized', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-project-goal-sync-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const service = new ProjectMemoryService(db, dataDir);
  const project = service.ensureProject(
    createConversation(db, 'coding', 'Guess and check'), 'coding', 'Guess and check', 'Use numbers 1-10.',
  );
  const goal = service.retrieve(project.id, 'numbers', 20).find((memory) => memory.category.endsWith(':goal'))!;
  const replacement = service.correct(goal.id, 'Use numbers 1-15.', 'task-update');
  assert.equal(service.get(project.id)?.goal, 'Use numbers 1-15.');

  const note = db.prepare('SELECT vault_path FROM project_memories WHERE id = ?').get(replacement) as { vault_path: string };
  writeFileSync(note.vault_path, readFileSync(note.vault_path, 'utf8').replace('Use numbers 1-15.', 'Use numbers 1-20.'), 'utf8');
  assert.equal(service.syncVault(), 1);
  assert.equal(service.get(project.id)?.goal, 'Use numbers 1-20.');
});

test('project memory startup repairs a legacy project record whose active goal diverged', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-project-goal-reconcile-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const service = new ProjectMemoryService(db, dataDir);
  const project = service.ensureProject(
    createConversation(db, 'coding', 'Legacy project'), 'coding', 'Legacy project', 'Old intake goal.',
  );
  const goal = service.retrieve(project.id, '', 20).find((memory) => memory.category.endsWith(':goal'))!;
  service.correct(goal.id, 'Active corrected goal.', 'task-correction');
  db.prepare('UPDATE project_records SET goal = ? WHERE id = ?').run('Stale record goal.', project.id);

  const restarted = new ProjectMemoryService(db, dataDir);
  assert.equal(restarted.get(project.id)?.goal, 'Active corrected goal.');
});

test('memory backup and restore includes project records, memories, artifacts, and vault notes', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-project-backup-'));
  const destination = mkdtempSync(join(tmpdir(), 'grover-project-export-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const memory = new MemoryService(db, dataDir);
  const projects = new ProjectMemoryService(db, dataDir);
  const conversationId = createConversation(db, 'coding', 'Portable project');
  const project = projects.ensureProject(conversationId, 'coding', 'Portable project', 'Move this project safely.');
  const decision = projects.remember(project.id, 'decision', 'Keep the model provider-neutral.', 'task-1', 'manager:task-1');
  projects.recordArtifact(project.id, 'task-1', 'link', 'grover://artifact/demo', 'Demo artifact');
  const profile = memory.remember({ content: 'Will prefers local Windows apps.', category: 'profile:preference', source: 'test' });
  const backup = memory.exportTo(destination);
  db.prepare('DELETE FROM conversation_search WHERE conversation_id = ?').run(conversationId);
  projects.forget(decision);
  memory.forget(profile);
  const restored = memory.restoreFrom(backup.path);
  projects.rewriteVault();
  assert.equal(restored.restored, 4, 'profile, goal, decision, and artifact project memories restored');
  assert.equal(projects.get(project.id)?.goal, 'Move this project safely.');
  assert.ok(projects.retrieve(project.id, 'provider', 20).some((item) => /provider-neutral/.test(item.content)));
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM project_artifacts').get() as { count: number }).count, 1);
  assert.equal((db.prepare(
    'SELECT COUNT(*) AS count FROM conversation_search WHERE conversation_id = ?'
  ).get(conversationId) as { count: number }).count, 1, 'restored project remains searchable');
  const restoredPath = (db.prepare('SELECT vault_path FROM project_memories WHERE id = ?').get(decision) as { vault_path: string }).vault_path;
  assert.equal(existsSync(restoredPath), true);
});

test('restoring a legacy profile-only backup preserves current project memory', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'grover-project-legacy-'));
  const destination = mkdtempSync(join(tmpdir(), 'grover-legacy-export-'));
  const db = openDb(join(dataDir, 'grover.db'));
  const memory = new MemoryService(db, dataDir);
  const projects = new ProjectMemoryService(db, dataDir);
  const project = projects.ensureProject(
    createConversation(db, 'coding', 'Keep me'), 'coding', 'Keep me', 'Preserve this project.',
  );
  const projectDecision = projects.remember(project.id, 'decision', 'Do not discard project state.', null, 'test');
  const profileId = memory.remember({ content: 'Legacy profile fact.', category: 'profile:fact', source: 'test' });
  const modern = memory.exportTo(destination);
  const payloadPath = join(modern.path, 'memory-export.json');
  const manifestPath = join(modern.path, 'manifest.json');
  const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
  const legacyPayload = JSON.stringify({
    version: 1, createdAt: payload.createdAt, namespaces: payload.namespaces, memories: payload.memories,
  }, null, 2);
  writeFileSync(payloadPath, legacyPayload, 'utf8');
  writeFileSync(manifestPath, JSON.stringify({ version: 1, sha256: createHash('sha256').update(legacyPayload).digest('hex') }, null, 2));
  memory.forget(profileId);
  memory.restoreFrom(modern.path);
  assert.equal(projects.hasMemory(projectDecision), true);
});

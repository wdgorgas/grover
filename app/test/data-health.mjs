import { DatabaseSync } from 'node:sqlite';

const path = process.env.GROVER_HEALTH_DB;
if (!path) throw new Error('Set GROVER_HEALTH_DB to the database that should be inspected.');
const db = new DatabaseSync(path, { readOnly: true });
const count = (sql) => db.prepare(sql).get().count;
const projectRoot = db.prepare("SELECT value FROM app_settings WHERE key = 'projects_root'").get()?.value ?? null;
const pendingBySensitivity = db.prepare(
  "SELECT sensitivity, COUNT(*) AS count FROM memory_update_proposals WHERE status = 'proposed' GROUP BY sensitivity ORDER BY sensitivity"
).all();
const pendingPreview = process.env.GROVER_HEALTH_INCLUDE_PENDING === 'true'
  ? db.prepare("SELECT sensitivity, rationale, proposed_content FROM memory_update_proposals WHERE status = 'proposed' ORDER BY created_at").all()
  : undefined;
const result = {
  activeMemories: count('SELECT COUNT(*) AS count FROM memories WHERE deleted_at IS NULL AND superseded_by IS NULL'),
  pendingMemoryProposals: count("SELECT COUNT(*) AS count FROM memory_update_proposals WHERE status = 'proposed'"),
  pendingBySensitivity,
  ...(pendingPreview ? { pendingPreview } : {}),
  projects: count('SELECT COUNT(*) AS count FROM projects'),
  modelProfiles: count('SELECT COUNT(*) AS count FROM engine_model_profiles WHERE enabled = 1'),
  conversationSearchRows: count('SELECT COUNT(*) AS count FROM conversation_search'),
  invalidTaskContexts: count("SELECT COUNT(*) AS count FROM task_state WHERE domain NOT IN ('general','coding','research','finance','health','business','builder')"),
  projectRoot,
};
db.close();
console.log(JSON.stringify(result, null, 2));

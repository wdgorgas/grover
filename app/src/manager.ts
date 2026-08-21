import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, realpathSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';

export type ManagerTask = 'route' | 'continuity' | 'retrieval' | 'memory' | 'execution' | 'clarify' | 'brief' | 'supervise' | 'respond';
export type ManagerState = 'unavailable' | 'starting' | 'ready' | 'error' | 'stopped';
export type ManagerStatus = {
  state: ManagerState;
  detail: string;
  modelHash: string | null;
  lastLatencyMs: number | null;
};

export type RouteDecision = {
  schema_version: '1.0';
  task: 'route';
  decision: {
    destination: 'general' | 'coding' | 'research' | 'finance' | 'health' | 'business' | 'lifestyle' | 'builder';
    work_kind: 'ask' | 'work' | 'act' | 'build';
    confidence: 'high' | 'medium' | 'low';
    rationale_codes: string[];
  };
};

export type ContinuityDecision = {
  schema_version: '1.0';
  task: 'continuity';
  decision: {
    action: 'continue' | 'reopen' | 'create' | 'branch' | 'clarify';
    target_conversation_id: string | null;
    target_project_id: string | null;
    search_needed: boolean;
    confidence: 'high' | 'medium' | 'low';
    rationale_codes: string[];
  };
};

export interface ManagerPlanner {
  status(): ManagerStatus;
  inferRoute(input: Record<string, unknown>): Promise<{ output: RouteDecision; latencyMs: number }>;
  inferContinuity?(input: Record<string, unknown>): Promise<{ output: ContinuityDecision; latencyMs: number }>;
  onStatus?(listener: () => void): void;
}

type InferenceManifest = {
  schema_version: string;
  runtime: string;
  runtime_version: string;
  model: string;
  model_sha256: string;
  context_length: number;
  prompt_mode: string;
  promoted: boolean;
};

const SYSTEM_PROMPT = 'You are GROVER Manager, a narrow local orchestration planner. You do not perform specialist work and you do not invent application state. Read TASK and INPUT. Return exactly one compact JSON object matching the requested task schema, with no Markdown or extra prose. Reference only IDs present in INPUT. Prefer local deterministic tools when they can answer accurately. Choose clarification only when missing information materially changes the outcome, risk, destination, or authorization. Never bypass unavailable tools, permissions, privacy boundaries, real-money approval, destructive-action approval, security approval, or jackson-private isolation. Personal facts and project contents remain in external storage; request only the minimum relevant records. Provider models are configurable workers, not managers.';

const ROUTE_RULE = "Choose destination and work_kind. Route by the work being performed, not a noun's eventual domain. Software creation goes to coding; changes to GROVER itself go to builder; calendar actions go to lifestyle.";
const CONTINUITY_RULE = 'Choose whether to continue the current conversation, reopen exactly one matching candidate, create a new one, branch away from the current conversation, or clarify. Never invent an ID.';

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${sortedJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function rawManagerPrompt(task: ManagerTask, input: Record<string, unknown>): string {
  const rules: Partial<Record<ManagerTask, string>> = { route: ROUTE_RULE, continuity: CONTINUITY_RULE };
  const rule = rules[task];
  if (!rule) throw new Error(`Manager task ${task} is not connected in this build.`);
  const user = `TASK: ${task}\nTASK_RULE: ${rule}\nINPUT: ${sortedJson(input)}\nReturn the task's v1 JSON output.`;
  return `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}

export function validateRouteDecision(value: unknown): RouteDecision {
  if (!value || typeof value !== 'object') throw new Error('Manager output is not an object.');
  const envelope = value as Record<string, unknown>;
  if (!hasExactKeys(envelope, ['schema_version', 'task', 'decision']) || envelope.schema_version !== '1.0' || envelope.task !== 'route') {
    throw new Error('Manager route envelope does not match schema v1.');
  }
  if (!envelope.decision || typeof envelope.decision !== 'object') throw new Error('Manager route decision is missing.');
  const decision = envelope.decision as Record<string, unknown>;
  if (!hasExactKeys(decision, ['destination', 'work_kind', 'confidence', 'rationale_codes'])) {
    throw new Error('Manager route decision has missing or unexpected fields.');
  }
  const destinations = new Set(['general', 'coding', 'research', 'finance', 'health', 'business', 'lifestyle', 'builder']);
  const workKinds = new Set(['ask', 'work', 'act', 'build']);
  const confidences = new Set(['high', 'medium', 'low']);
  if (!destinations.has(String(decision.destination)) || !workKinds.has(String(decision.work_kind)) || !confidences.has(String(decision.confidence))) {
    throw new Error('Manager route decision contains an unknown enum value.');
  }
  if (!Array.isArray(decision.rationale_codes) || !decision.rationale_codes.length ||
      decision.rationale_codes.some((code) => typeof code !== 'string' || !/^[a-z0-9_:-]+$/.test(code))) {
    throw new Error('Manager route rationale is invalid.');
  }
  return value as RouteDecision;
}

export function validateContinuityDecision(value: unknown, allowedTargets: Map<string, string | null>): ContinuityDecision {
  if (!value || typeof value !== 'object') throw new Error('Manager output is not an object.');
  const envelope = value as Record<string, unknown>;
  if (!hasExactKeys(envelope, ['schema_version', 'task', 'decision']) || envelope.schema_version !== '1.0' || envelope.task !== 'continuity') {
    throw new Error('Manager continuity envelope does not match schema v1.');
  }
  if (!envelope.decision || typeof envelope.decision !== 'object') throw new Error('Manager continuity decision is missing.');
  const decision = envelope.decision as Record<string, unknown>;
  if (!hasExactKeys(decision, [
    'action', 'target_conversation_id', 'target_project_id', 'search_needed', 'confidence', 'rationale_codes',
  ])) throw new Error('Manager continuity decision has missing or unexpected fields.');
  if (!new Set(['continue', 'reopen', 'create', 'branch', 'clarify']).has(String(decision.action)) ||
      typeof decision.search_needed !== 'boolean' || !new Set(['high', 'medium', 'low']).has(String(decision.confidence))) {
    throw new Error('Manager continuity decision contains an unknown enum value.');
  }
  if (!Array.isArray(decision.rationale_codes) || !decision.rationale_codes.length ||
      decision.rationale_codes.some((code) => typeof code !== 'string' || !/^[a-z0-9_:-]+$/.test(code))) {
    throw new Error('Manager continuity rationale is invalid.');
  }
  const conversationId = decision.target_conversation_id;
  const projectId = decision.target_project_id;
  if (['continue', 'reopen'].includes(String(decision.action))) {
    if (typeof conversationId !== 'string' || !allowedTargets.has(conversationId)) {
      throw new Error('Manager continuity referenced an unavailable conversation.');
    }
    if (projectId !== allowedTargets.get(conversationId)) {
      throw new Error('Manager continuity paired a conversation with the wrong project.');
    }
  } else if (conversationId !== null || projectId !== null) {
    throw new Error('Manager continuity supplied a target for a targetless action.');
  }
  return value as ContinuityDecision;
}

function pathWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function sha256(path: string): Promise<string> {
  return await new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolveHash(hash.digest('hex').toUpperCase()));
  });
}

async function availablePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

export function managerServerArgs(model: string, port: number, contextLength: number): string[] {
  return [
    '-m', model, '-ngl', 'all', '-c', String(contextLength), '-np', '1', '-fa', 'on',
    '--cache-prompt', '--cache-ram', '0', '--host', '127.0.0.1', '--port', String(port),
    '--cors-origins', 'https://grover.invalid', '--no-cors-credentials', '--no-webui', '--no-slots', '-lv', '1',
  ];
}

export class ManagerHttpClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(endpoint: string, apiKey: string, timeoutMs = 12_000) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(2_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async inferRoute(input: Record<string, unknown>): Promise<{ output: RouteDecision; latencyMs: number }> {
    const result = await this.complete('route', input, 64);
    return { output: validateRouteDecision(result.parsed), latencyMs: result.latencyMs };
  }

  async inferContinuity(input: Record<string, unknown>): Promise<{ output: ContinuityDecision; latencyMs: number }> {
    const result = await this.complete('continuity', input, 96);
    const current = input.current_conversation as { id?: unknown } | null;
    const candidates = Array.isArray(input.candidate_conversations) ? input.candidate_conversations as Record<string, unknown>[] : [];
    const allowedTargets = new Map<string, string | null>();
    if (current && typeof current.id === 'string') allowedTargets.set(current.id, null);
    for (const candidate of candidates) {
      if (typeof candidate.id === 'string') {
        allowedTargets.set(candidate.id, typeof candidate.project_id === 'string' ? candidate.project_id : null);
      }
    }
    return {
      output: validateContinuityDecision(result.parsed, allowedTargets),
      latencyMs: result.latencyMs,
    };
  }

  private async complete(task: 'route' | 'continuity', input: Record<string, unknown>, nPredict: number): Promise<{ parsed: unknown; latencyMs: number }> {
    const started = performance.now();
    const response = await fetch(`${this.endpoint}/completion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: rawManagerPrompt(task, input), temperature: 0, seed: 20260818, n_predict: nPredict,
        repeat_penalty: 1.0, stop: ['<|im_end|>'], cache_prompt: true,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Local manager returned HTTP ${response.status}.`);
    const body = await response.json() as { content?: unknown };
    if (typeof body.content !== 'string' || body.content.length > 16_384) throw new Error('Local manager returned an invalid response body.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.content.trim());
    } catch {
      throw new Error('Local manager returned invalid JSON.');
    }
    return { parsed, latencyMs: Math.round(performance.now() - started) };
  }
}

export function defaultManagerRuntimeRoot(): string {
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  return join(local, 'GROVER', 'manager-inference');
}

export class LocalManagerRuntime extends EventEmitter implements ManagerPlanner {
  private readonly root: string;
  private current: ManagerStatus = { state: 'stopped', detail: 'Local manager has not started.', modelHash: null, lastLatencyMs: null };
  private child: ChildProcessWithoutNullStreams | null = null;
  private client: ManagerHttpClient | null = null;
  private startPromise: Promise<void> | null = null;
  private stopping = false;

  constructor(root = defaultManagerRuntimeRoot()) {
    super();
    this.root = root;
  }

  status(): ManagerStatus {
    return { ...this.current };
  }

  onStatus(listener: () => void): void {
    this.on('status', listener);
  }

  private setStatus(next: ManagerStatus): void {
    this.current = next;
    this.emit('status');
  }

  start(): Promise<void> {
    if (this.current.state === 'ready') return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  private async startInternal(): Promise<void> {
    this.stopping = false;
    this.setStatus({ ...this.current, state: 'starting', detail: 'Checking the local manager model.' });
    const manifestPath = join(this.root, 'inference_manifest.json');
    if (!existsSync(manifestPath)) {
      this.setStatus({ ...this.current, state: 'unavailable', detail: 'Local manager is not prepared on this computer.' });
      return;
    }
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')) as InferenceManifest;
      if (manifest.schema_version !== '1.0' || manifest.runtime !== 'llama.cpp' || manifest.prompt_mode !== 'raw_qwen3') {
        throw new Error('The local manager manifest is incompatible.');
      }
      const runtime = realpathSync(join(this.root, `llama-${manifest.runtime_version}`, 'llama-server.exe'));
      const model = realpathSync(manifest.model);
      const actualRoot = realpathSync(this.root);
      if (!pathWithin(actualRoot, runtime) || !pathWithin(actualRoot, model)) throw new Error('Manager runtime paths leave the approved local folder.');
      const modelHash = await sha256(model);
      if (modelHash !== manifest.model_sha256.toUpperCase()) throw new Error('The local manager model hash does not match its manifest.');
      if (this.stopping) return;
      const port = await availablePort();
      if (this.stopping) return;
      const apiKey = randomBytes(32).toString('base64url');
      const child = spawn(runtime, managerServerArgs(model, port, manifest.context_length), {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, LLAMA_API_KEY: apiKey },
      });
      this.child = child;
      let diagnostics = '';
      const collect = (chunk: Buffer | string) => { diagnostics = `${diagnostics}${String(chunk)}`.slice(-8_192); };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      child.once('error', (error) => {
        if (!this.stopping) this.setStatus({ ...this.current, state: 'error', detail: `Local manager could not start: ${String(error)}` });
      });
      child.once('close', (code) => {
        this.child = null;
        this.client = null;
        if (!this.stopping) {
          const tail = diagnostics.trim().split(/\r?\n/).slice(-1)[0];
          this.setStatus({ ...this.current, state: 'error', detail: `Local manager stopped${code === null ? '' : ` with code ${code}`}${tail ? `: ${tail}` : '.'}` });
        }
      });
      const client = new ManagerHttpClient(`http://127.0.0.1:${port}`, apiKey);
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline && child.exitCode === null) {
        if (await client.health()) {
          this.client = client;
          this.setStatus({
            state: 'ready', detail: 'Local manager is ready in shadow mode.', modelHash, lastLatencyMs: null,
          });
          return;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 250));
      }
      if (this.stopping) return;
      throw new Error(`Local manager did not become ready.${diagnostics ? ` ${diagnostics.trim().split(/\r?\n/).slice(-1)[0]}` : ''}`);
    } catch (error) {
      this.stop();
      this.setStatus({ ...this.current, state: 'error', detail: String(error).replace(/^Error:\s*/, '') });
    }
  }

  async inferRoute(input: Record<string, unknown>): Promise<{ output: RouteDecision; latencyMs: number }> {
    await this.start();
    if (!this.client || this.current.state !== 'ready') throw new Error(this.current.detail);
    const result = await this.client.inferRoute(input);
    this.setStatus({ ...this.current, lastLatencyMs: result.latencyMs });
    return result;
  }

  async inferContinuity(input: Record<string, unknown>): Promise<{ output: ContinuityDecision; latencyMs: number }> {
    await this.start();
    if (!this.client || this.current.state !== 'ready') throw new Error(this.current.detail);
    const result = await this.client.inferContinuity(input);
    this.setStatus({ ...this.current, lastLatencyMs: result.latencyMs });
    return result;
  }

  stop(): void {
    this.stopping = true;
    const child = this.child;
    this.child = null;
    this.client = null;
    if (child && child.exitCode === null) child.kill();
    this.setStatus({ ...this.current, state: 'stopped', detail: 'Local manager is stopped.' });
  }
}

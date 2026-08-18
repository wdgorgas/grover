import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export type EngineMode = 'ask' | 'work' | 'build';

export type EngineUpdate = {
  kind: 'started' | 'progress' | 'result';
  plainLanguage: string;
  detail?: string;
  sessionId?: string;
  costUsd?: number;
};

export type EngineResult = {
  answer: string;
  sessionId?: string;
  costUsd: number;
  usage?: Record<string, number>;
};

export interface ExecutionEngine {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: EngineMode[];
  readonly available: boolean;
  run(options: EngineRunOptions): Promise<EngineResult>;
  cancel(runKey: string): boolean;
  probeAuth?(): Promise<'signed-in' | 'sign-in-required' | 'unknown'>;
  signIn?(): void;
}

export type EngineRunOptions = {
  runKey: string;
  prompt: string;
  cwd: string;
  mode: EngineMode;
  maxBudgetUsd: number;
  resumeSessionId?: string;
  onUpdate: (update: EngineUpdate) => void;
};

export function findClaudeExecutable(): string | null {
  const candidates = [
    process.env.CLAUDE_PATH,
    process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe') : null,
  ].filter(Boolean) as string[];
  return candidates.find(existsSync) ?? null;
}

function runStatus(executable: string, args: string[], timeoutMs = 12_000): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => { output += chunk; });
    child.stderr?.on('data', (chunk: string) => { output += chunk; });
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ code: null, output: String(error) });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output: output.trim() });
    });
  });
}

function openSignIn(executable: string, args: string[]): void {
  const child = spawn(executable, args, { detached: true, windowsHide: true, stdio: 'ignore' });
  child.unref();
}

function progressFromRecord(record: Record<string, any>): EngineUpdate | null {
  if (record.type === 'system' && record.subtype === 'init') {
    return { kind: 'started', plainLanguage: 'Claude is ready and has begun', sessionId: record.session_id };
  }
  if (record.type === 'assistant') {
    const blocks = record.message?.content ?? [];
    const tool = blocks.find((block: any) => block.type === 'tool_use');
    if (tool) {
      const labels: Record<string, string> = {
        Read: 'Reading the relevant files', Glob: 'Finding the relevant files', Grep: 'Searching the project',
        Edit: 'Editing the project', Write: 'Creating a project file', Bash: 'Running a project command',
      };
      return {
        kind: 'progress',
        plainLanguage: labels[tool.name] ?? `Using ${tool.name}`,
        detail: JSON.stringify(tool.input ?? {}),
        sessionId: record.session_id,
      };
    }
  }
  if (record.type === 'result') {
    return {
      kind: 'result',
      plainLanguage: record.is_error ? 'Claude stopped with an error' : 'Claude finished the requested work',
      detail: typeof record.result === 'string' ? record.result : JSON.stringify(record.result ?? ''),
      sessionId: record.session_id,
      costUsd: Number(record.total_cost_usd ?? 0),
    };
  }
  return null;
}

export class ClaudeCliEngine {
  readonly id = 'claude-cli';
  readonly displayName = 'Claude';
  readonly capabilities: EngineMode[] = ['ask', 'work', 'build'];
  readonly executable: string | null;
  private children = new Map<string, ChildProcessWithoutNullStreams>();

  constructor(executable = findClaudeExecutable()) {
    this.executable = executable;
  }

  get available(): boolean {
    return Boolean(this.executable);
  }

  async probeAuth(): Promise<'signed-in' | 'sign-in-required' | 'unknown'> {
    if (!this.executable) return 'unknown';
    const result = await runStatus(this.executable, ['auth', 'status', '--json']);
    if (/"loggedIn"\s*:\s*true/i.test(result.output)) return 'signed-in';
    if (/"loggedIn"\s*:\s*false/i.test(result.output)) return 'sign-in-required';
    return 'unknown';
  }

  signIn(): void {
    if (!this.executable) throw new Error('Claude is not installed on this computer.');
    openSignIn(this.executable, ['auth', 'login']);
  }

  async run(options: EngineRunOptions): Promise<EngineResult> {
    if (!this.executable) throw new Error('Claude Code is not installed on this computer.');
    const args = [
      '--print', '--verbose', '--output-format', 'stream-json',
      '--max-budget-usd', String(options.maxBudgetUsd),
      '--permission-mode', options.mode === 'build' ? 'acceptEdits' : 'dontAsk',
      '--allowed-tools', options.mode === 'build' ? 'Read,Edit,Write,Glob,Grep,Bash' : 'Read,Glob,Grep',
      '--no-session-persistence',
    ];
    if (options.resumeSessionId) args.push('--resume', options.resumeSessionId);
    args.push(options.prompt);

    return await new Promise<EngineResult>((resolve, reject) => {
      const child = spawn(this.executable!, args, {
        cwd: options.cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.children.set(options.runKey, child);
      let stdoutBuffer = '';
      let stderr = '';
      let final: EngineResult = { answer: '', costUsd: 0 };

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line) as Record<string, any>;
            const update = progressFromRecord(record);
            if (!update) continue;
            options.onUpdate(update);
            if (update.kind === 'result') {
              final = { answer: update.detail ?? '', sessionId: update.sessionId, costUsd: update.costUsd ?? 0 };
            }
          } catch {
            // Claude occasionally emits non-JSON diagnostic lines; stderr/result still report failure.
          }
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code) => {
        this.children.delete(options.runKey);
        if (code === 0) resolve(final);
        else reject(new Error(stderr.trim() || `Claude exited with code ${code}`));
      });
    });
  }

  cancel(runKey: string): boolean {
    const child = this.children.get(runKey);
    if (!child) return false;
    child.kill();
    this.children.delete(runKey);
    return true;
  }

  cancelAll(): string[] {
    const keys = [...this.children.keys()];
    for (const key of keys) this.cancel(key);
    return keys;
  }
}

export function findCodexExecutable(): string | null {
  const candidates: string[] = [];
  if (process.env.CODEX_PATH) candidates.push(process.env.CODEX_PATH);
  if (process.resourcesPath) candidates.push(join(process.resourcesPath, 'codex-runtime', 'bin', 'codex.exe'));
  try {
    const require = createRequire(import.meta.url);
    const packageJson = require.resolve('@openai/codex-win32-x64/package.json');
    const raw = join(dirname(packageJson), 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
    // Electron can stat files inside app.asar, but Windows cannot spawn them.
    // Prefer the asarUnpack mirror whenever packaging has created one.
    candidates.push(raw.replace('app.asar', 'app.asar.unpacked'), raw);
  } catch {
    // Optional platform package is absent on non-Windows machines.
  }
  if (process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe'));
  }
  return candidates.find(existsSync) ?? null;
}

function codexProgress(record: Record<string, any>): EngineUpdate | null {
  if (record.type === 'thread.started') {
    return { kind: 'started', plainLanguage: 'Codex is ready and has begun', sessionId: record.thread_id };
  }
  if (record.type === 'item.started') {
    const item = record.item ?? {};
    if (item.type === 'command_execution') {
      return { kind: 'progress', plainLanguage: 'Running a project command', detail: item.command };
    }
    if (item.type === 'file_change') return { kind: 'progress', plainLanguage: 'Editing the project' };
    if (item.type === 'reasoning') return { kind: 'progress', plainLanguage: 'Working through the request' };
  }
  if (record.type === 'item.completed') {
    const item = record.item ?? {};
    if (item.type === 'command_execution') {
      return { kind: 'progress', plainLanguage: 'Finished a project command', detail: item.aggregated_output ?? item.command };
    }
    if (item.type === 'file_change') return { kind: 'progress', plainLanguage: 'Saved a project edit', detail: JSON.stringify(item.changes ?? []) };
    if (item.type === 'agent_message') return { kind: 'result', plainLanguage: 'Codex finished the requested work', detail: item.text ?? '' };
  }
  return null;
}

export class CodexCliEngine implements ExecutionEngine {
  readonly id = 'codex-cli';
  readonly displayName = 'Codex';
  readonly capabilities: EngineMode[] = ['ask', 'work', 'build'];
  readonly executable: string | null;
  private children = new Map<string, ChildProcessWithoutNullStreams>();

  constructor(executable = findCodexExecutable()) {
    this.executable = executable;
  }

  get available(): boolean {
    return Boolean(this.executable);
  }

  async probeAuth(): Promise<'signed-in' | 'sign-in-required' | 'unknown'> {
    if (!this.executable) return 'unknown';
    const result = await runStatus(this.executable, ['login', 'status']);
    if (/logged in/i.test(result.output)) return 'signed-in';
    if (/not logged in|login required|sign in/i.test(result.output)) return 'sign-in-required';
    return 'unknown';
  }

  signIn(): void {
    if (!this.executable) throw new Error('Codex is not installed on this computer.');
    openSignIn(this.executable, ['login']);
  }

  async run(options: EngineRunOptions): Promise<EngineResult> {
    if (!this.executable) throw new Error('Codex CLI is not installed on this computer.');
    const args = [
      '-a', 'never',
      'exec', '--json', '--color', 'never',
      '--sandbox', options.mode === 'build' ? 'workspace-write' : 'read-only',
      '--cd', options.cwd,
    ];
    if (options.mode !== 'build') args.push('--ephemeral');
    args.push(options.prompt);

    return await new Promise<EngineResult>((resolve, reject) => {
      const child = spawn(this.executable!, args, {
        cwd: options.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.children.set(options.runKey, child);
      let stdoutBuffer = '';
      let stderr = '';
      let answer = '';
      let sessionId: string | undefined;
      let usage: Record<string, number> | undefined;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line) as Record<string, any>;
            if (record.type === 'thread.started') sessionId = record.thread_id;
            if (record.type === 'turn.completed') usage = record.usage;
            const update = codexProgress(record);
            if (!update) continue;
            if (sessionId && !update.sessionId) update.sessionId = sessionId;
            options.onUpdate(update);
            if (update.kind === 'result') answer = update.detail ?? answer;
          } catch {
            // Warnings are written to stderr; an unknown stdout line is ignored and retained in diagnostics.
          }
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code) => {
        this.children.delete(options.runKey);
        if (code === 0) resolve({ answer, sessionId, costUsd: 0, usage });
        else reject(new Error(stderr.trim() || `Codex exited with code ${code}`));
      });
    });
  }

  cancel(runKey: string): boolean {
    const child = this.children.get(runKey);
    if (!child) return false;
    child.kill();
    this.children.delete(runKey);
    return true;
  }
}

export type Route = {
  selected: ExecutionEngine;
  backup: ExecutionEngine | null;
  reason: string;
  userOverride: boolean;
};

export class EngineRouter {
  readonly engines: ExecutionEngine[];
  private active = new Map<string, ExecutionEngine>();
  private health = new Map<string, {
    healthy: boolean | null;
    auth: 'signed-in' | 'sign-in-required' | 'unknown';
    lastError: string | null;
  }>();

  constructor(engines: ExecutionEngine[] = [new CodexCliEngine(), new ClaudeCliEngine()]) {
    this.engines = engines;
    for (const engine of engines) this.health.set(engine.id, { healthy: null, auth: 'unknown', lastError: null });
  }

  route(intent: EngineMode, preference: string = 'auto', excludeId?: string): Route {
    const capable = this.engines.filter((engine) =>
      engine.available && this.health.get(engine.id)?.healthy !== false && this.health.get(engine.id)?.auth !== 'sign-in-required' &&
      engine.capabilities.includes(intent) && engine.id !== excludeId
    );
    if (!capable.length) throw new Error(`No installed engine can handle ${intent}.`);
    const forced = preference !== 'auto' ? capable.find((engine) => engine.id === preference) : undefined;
    const selected = forced ?? capable.find((engine) => engine.id === 'codex-cli') ?? capable[0];
    const backup = capable.find((engine) => engine.id !== selected.id) ?? null;
    return {
      selected, backup,
      reason: forced
        ? `${selected.displayName} was selected by the user preference.`
        : `${selected.displayName} matches the task and is the current preferred available engine.`,
      userOverride: Boolean(forced),
    };
  }

  get(id: string): ExecutionEngine | null {
    return this.engines.find((engine) => engine.id === id && engine.available) ?? null;
  }

  async run(engine: ExecutionEngine, options: EngineRunOptions): Promise<EngineResult> {
    this.active.set(options.runKey, engine);
    try {
      const result = await engine.run(options);
      this.health.set(engine.id, { healthy: true, auth: 'signed-in', lastError: null });
      return result;
    } catch (error) {
      const previous = this.health.get(engine.id) ?? { healthy: null, auth: 'unknown' as const, lastError: null };
      const detail = String(error);
      const auth = /login|logged.?in|oauth|authentication|unauthorized|credential/i.test(detail)
        ? 'sign-in-required' as const : previous.auth;
      this.health.set(engine.id, { healthy: false, auth, lastError: detail });
      throw error;
    } finally {
      this.active.delete(options.runKey);
    }
  }

  cancel(runKey: string): boolean {
    const engine = this.active.get(runKey);
    if (!engine) return false;
    this.active.delete(runKey);
    return engine.cancel(runKey);
  }

  cancelAll(): string[] {
    const keys = [...this.active.keys()];
    for (const key of keys) this.cancel(key);
    return keys;
  }

  availability(): Record<string, boolean> {
    return Object.fromEntries(this.engines.map((engine) => [engine.id, engine.available]));
  }

  async refreshStatus(): Promise<void> {
    await Promise.all(this.engines.map(async (engine) => {
      const current = this.health.get(engine.id) ?? { healthy: null, auth: 'unknown' as const, lastError: null };
      if (!engine.available) {
        this.health.set(engine.id, { healthy: false, auth: 'unknown', lastError: 'Not installed' });
        return;
      }
      if (!engine.probeAuth) return;
      try {
        const auth = await engine.probeAuth();
        this.health.set(engine.id, {
          healthy: auth === 'sign-in-required' ? false : null,
          auth,
          lastError: auth === 'sign-in-required' ? 'Sign-in required' : null,
        });
      } catch (error) {
        this.health.set(engine.id, { ...current, lastError: String(error) });
      }
    }));
  }

  signIn(engineId: string): void {
    const engine = this.engines.find((candidate) => candidate.id === engineId);
    if (!engine?.available || !engine.signIn) throw new Error('That agent is not installed or cannot sign in from GROVER.');
    engine.signIn();
    const current = this.health.get(engineId) ?? { healthy: null, auth: 'unknown' as const, lastError: null };
    this.health.set(engineId, { ...current, auth: 'unknown', healthy: null, lastError: 'Sign-in opened' });
  }

  status(): Record<string, {
    installed: boolean;
    healthy: boolean | null;
    auth: 'signed-in' | 'sign-in-required' | 'unknown';
    state: 'ready' | 'sign-in-required' | 'unavailable' | 'error' | 'checking';
    lastError: string | null;
  }> {
    return Object.fromEntries(this.engines.map((engine) => [
      engine.id,
      (() => {
        const status = this.health.get(engine.id) ?? { healthy: null, auth: 'unknown' as const, lastError: null };
        const state = !engine.available ? 'unavailable'
          : status.auth === 'sign-in-required' ? 'sign-in-required'
          : status.healthy === false ? 'error'
          : status.auth === 'signed-in' || status.healthy === true ? 'ready'
          : 'checking';
        return { installed: engine.available, ...status, state };
      })(),
    ]));
  }
}

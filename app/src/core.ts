import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import { EngineRouter, type EngineUpdate, type ExecutionEngine, type Route } from './engine.ts';
import {
  addEvidence, appendTaskProgress, checkBudget, closureReady, completeReceipt, completeRoutingDecision, createBuild,
  createTask, deleteMemory, engineRanking, getSetting, inferIntent, rateTaskRouting, recordCommit, recordCost, saveMemory,
  recordRoutingDecision, setSetting, snapshot, transitionRun, type Intent,
} from './store.ts';

const execFileAsync = promisify(execFile);

type SubmitInput = { text: string; intent?: Intent; engine?: string };

function truncate(value: string, max = 180): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

export function findRepoRoot(start: string): string | null {
  let current = resolve(start);
  if (!existsSync(current)) current = dirname(current);
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(current, '.git')) && existsSync(join(current, 'AGENTS.md'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

async function command(file: string, args: string[], cwd: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(file, args, {
    cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024,
  });
  return `${stdout ?? ''}${stderr ?? ''}`.trim();
}

async function git(root: string, args: string[]): Promise<string> {
  return command('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, ...args], root);
}

async function npmTest(root: string): Promise<string> {
  const appDir = join(root, 'app');
  if (process.platform === 'win32') {
    return command(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm test'], appDir);
  }
  const npmCmd = join(dirname(process.execPath), 'npm.cmd');
  if (existsSync(npmCmd)) return command(npmCmd, ['test'], appDir);
  const systemNpm = process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'npm.cmd') : 'npm.cmd';
  if (existsSync(systemNpm)) return command(systemNpm, ['test'], appDir);
  return command('npm', ['test'], appDir);
}

export class GroverCore extends EventEmitter {
  readonly db: DatabaseSync;
  readonly router: EngineRouter;
  readonly dataDir: string;
  private workspaceRoot: string | null;
  private stopReasons = new Map<string, 'paused' | 'cancelled' | 'killed'>();
  private taskIntents = new Map<string, Intent>();
  private routingByRun = new Map<string, string>();

  constructor(options: { db: DatabaseSync; dataDir: string; workspaceRoot?: string | null; router?: EngineRouter }) {
    super();
    this.db = options.db;
    this.dataDir = options.dataDir;
    this.router = options.router ?? new EngineRouter();
    const stored = getSetting(this.db, 'workspace_root');
    this.workspaceRoot = options.workspaceRoot ?? stored;
    if (this.workspaceRoot) setSetting(this.db, 'workspace_root', this.workspaceRoot);
    mkdirSync(join(this.dataDir, 'evidence'), { recursive: true });
    mkdirSync(join(this.dataDir, 'vault', 'will-private'), { recursive: true });
  }

  getSnapshot(): Record<string, unknown> {
    return {
      ...snapshot(this.db),
      runtime: {
        engineAvailability: this.router.availability(),
        engineStatus: this.router.status(),
        workspaceRoot: this.workspaceRoot,
        localOnly: true,
      },
    };
  }

  private changed(): void {
    this.emit('state', this.getSnapshot());
  }

  setWorkspaceRoot(root: string): void {
    const found = findRepoRoot(root);
    if (!found) throw new Error('That folder is not the GROVER repository. Choose the folder containing AGENTS.md and .git.');
    this.workspaceRoot = found;
    setSetting(this.db, 'workspace_root', found);
    this.changed();
  }

  submit(input: SubmitInput): { taskId: string; intent: Intent } {
    const text = input.text?.trim();
    if (!text) throw new Error('Type a request first.');
    if (text.length > 10_000) throw new Error('Keep a single request under 10,000 characters.');
    const intent = input.intent ?? inferIntent(text);
    if (!['ask', 'work', 'act', 'build', 'remember'].includes(intent)) throw new Error('Unknown request intent.');
    const taskId = createTask(this.db, intent, text);
    this.taskIntents.set(taskId, intent);
    this.changed();

    if (intent === 'remember') {
      const content = text.replace(/^(remember|save this|keep this in mind)\s*(that|:)?\s*/i, '').trim() || text;
      const memoryId = saveMemory(this.db, content);
      const note = [
        '---', 'owner: will', 'namespace: will-private', 'category: direct',
        'confidence: high', 'sensitivity: private', `source: direct:${taskId}`,
        `created: ${new Date().toISOString()}`, '---', '', content, '',
      ].join('\n');
      writeFileSync(join(this.dataDir, 'vault', 'will-private', `${memoryId}.md`), note, 'utf8');
      appendTaskProgress(this.db, taskId, 'done', 'Remembered that locally', content);
      this.changed();
    } else if (intent === 'act') {
      appendTaskProgress(
        this.db, taskId, 'blocked',
        'External actions are not configured in this local build',
        'Ask, project work, GROVER changes, and direct memory are available. External account actions remain intentionally disconnected.',
      );
      this.changed();
    } else if (intent === 'build') {
      const route = this.routeTask(taskId, intent, input.engine);
      const { runId } = createBuild(this.db, taskId, text, route.selected.id);
      this.routingByRun.set(runId, route.decisionId);
      this.changed();
      void this.runBuild(runId, text, false, route).catch((error) => this.handleBuildFailure(runId, error));
    } else {
      const route = this.routeTask(taskId, intent, input.engine);
      void this.runConversation(taskId, intent, text, route).catch((error) => {
        if (this.stopReasons.has(taskId)) return;
        completeRoutingDecision(this.db, route.decisionId, `failed:${route.selected.id}`);
        appendTaskProgress(this.db, taskId, 'failed', 'The request stopped before completion', String(error));
        this.changed();
      });
    }
    return { taskId, intent };
  }

  private routeTask(taskId: string, intent: 'ask' | 'work' | 'build', engineOverride?: string): Route & { decisionId: string } {
    const storedPreference = getSetting(this.db, 'preferred_engine') ?? 'auto';
    const explicitPreference = engineOverride ?? (storedPreference !== 'auto' ? storedPreference : undefined);
    const ranking = engineRanking(this.db, intent);
    const preference = explicitPreference ?? ranking[0]?.id ?? 'auto';
    const route = this.router.route(intent, preference);
    if (!explicitPreference) {
      route.userOverride = false;
      route.reason = `${route.selected.displayName} best matches this ${intent} request using capability, availability, user preference, and ${ranking[0]?.samples ?? 0} recorded outcomes.`;
    }
    const decisionId = recordRoutingDecision(
      this.db, taskId, intent, route.selected.id, route.backup?.id ?? null, route.reason, route.userOverride,
    );
    appendTaskProgress(this.db, taskId, 'planning', `Routing to ${route.selected.displayName}`, route.reason);
    return { ...route, decisionId };
  }

  private requireWorkspace(): string {
    if (!this.workspaceRoot) throw new Error('Choose the local GROVER project folder before starting model work.');
    return this.workspaceRoot;
  }

  private handleEngineUpdate(taskId: string, runId: string | null, update: EngineUpdate): void {
    if (update.kind === 'result') return;
    if (runId) {
      transitionRun(this.db, runId, 'running', 'editing', update.plainLanguage, {
        actor: 'engine', detail: update.detail, sessionId: update.sessionId,
      });
    } else {
      appendTaskProgress(this.db, taskId, 'editing', update.plainLanguage, update.detail ?? '');
    }
    this.changed();
  }

  private async runConversation(
    taskId: string,
    intent: 'ask' | 'work',
    text: string,
    route: Route & { decisionId: string },
  ): Promise<void> {
    const root = this.requireWorkspace();
    checkBudget(this.db, 250_000);
    recordCost(this.db, taskId, null, 'estimate', 250_000, `${intent} estimate`);
    appendTaskProgress(this.db, taskId, 'planning', intent === 'ask' ? 'Thinking through your question' : 'Preparing the requested work');
    this.changed();
    const prompt = intent === 'ask'
      ? `Answer the user's request clearly and directly. You may read the GROVER project for context but may not modify anything.\n\nUser request:\n${text}`
      : `Produce the requested analysis or written artifact. You may read the GROVER project for context but may not modify files or external state. Return a finished result.\n\nUser request:\n${text}`;
    let selected = route.selected;
    let result;
    try {
      result = await this.router.run(selected, {
        runKey: taskId, prompt, cwd: root, mode: intent, maxBudgetUsd: 1,
        onUpdate: (update) => this.handleEngineUpdate(taskId, null, update),
      });
    } catch (error) {
      if (!route.backup) throw error;
      appendTaskProgress(this.db, taskId, 'planning', `${selected.displayName} stopped; trying ${route.backup.displayName}`, String(error));
      selected = route.backup;
      result = await this.router.run(selected, {
        runKey: taskId, prompt, cwd: root, mode: intent, maxBudgetUsd: 1,
        onUpdate: (update) => this.handleEngineUpdate(taskId, null, update),
      });
    }
    const actual = Math.max(0, Math.round(result.costUsd * 1_000_000));
    recordCost(this.db, taskId, null, 'actual', actual, `${intent} actual; usage ${JSON.stringify(result.usage ?? {})}`, selected.id);
    appendTaskProgress(this.db, taskId, 'done', 'Finished', result.answer, actual);
    completeRoutingDecision(this.db, route.decisionId, `passed:${selected.id}`);
    this.changed();
  }

  private async prepareBuildBranch(runId: string, resume: boolean): Promise<string> {
    const root = this.requireWorkspace();
    if (resume) {
      return git(root, ['branch', '--show-current']);
    }
    const status = await git(root, ['status', '--porcelain=v1']);
    if (status.trim()) throw new Error('The GROVER project has uncommitted changes. Finish or commit them before starting an automatic build.');
    const branch = `codex/grover-${runId.slice(0, 8)}`;
    await git(root, ['switch', '-c', branch]);
    this.db.prepare('UPDATE build_runs SET branch_name = ? WHERE id = ?').run(branch, runId);
    return branch;
  }

  private async runBuild(runId: string, request: string, resume = false, initialRoute?: Route & { decisionId?: string }): Promise<void> {
    const root = this.requireWorkspace();
    checkBudget(this.db, 1_000_000);
    const run = this.db.prepare('SELECT task_id, engine_session_id, engine_id FROM build_runs WHERE id = ?').get(runId) as {
      task_id: string; engine_session_id: string | null; engine_id: string;
    };
    const selectedEngine = initialRoute?.selected ?? this.router.get(run.engine_id);
    if (!selectedEngine) throw new Error(`The selected engine '${run.engine_id}' is not available.`);
    const branch = await this.prepareBuildBranch(runId, resume);
    recordCost(this.db, run.task_id, runId, 'estimate', 1_000_000, 'Builder run estimate');
    transitionRun(this.db, runId, 'running', 'planning', resume ? 'Resuming the GROVER change' : 'Started a safe build branch');
    this.changed();

    const prompt = [
      'Implement one bounded change in the GROVER repository.',
      'Follow AGENTS.md and the binding planning spec. Work only on this request.',
      'Do not deploy, change security boundaries, read ignored/private files, or commit.',
      'Use the existing architecture, keep the result functional, and run relevant tests.',
      '', 'User request:', request,
    ].join('\n');
    const result = await this.router.run(selectedEngine, {
      runKey: runId, prompt, cwd: root, mode: 'build', maxBudgetUsd: 2,
      resumeSessionId: resume ? run.engine_session_id ?? undefined : undefined,
      onUpdate: (update) => this.handleEngineUpdate(run.task_id, runId, update),
    });
    const actual = Math.max(0, Math.round(result.costUsd * 1_000_000));
    recordCost(this.db, run.task_id, runId, 'actual', actual, `Builder run actual; usage ${JSON.stringify(result.usage ?? {})}`, selectedEngine.id);
    transitionRun(this.db, runId, 'verifying', 'verifying', 'Checking the change before saving it', {
      actor: 'system', detail: result.answer, costDelta: actual, sessionId: result.sessionId,
    });
    this.changed();

    const testOutput = await npmTest(root);
    await git(root, ['diff', '--check']);
    const status = await git(root, ['status', '--porcelain=v1']);
    if (!status.trim()) throw new Error('The Builder finished without changing any project files.');
    const forbidden = status.split(/\r?\n/).some((line) =>
      /(?:archive[\\/]grover_v1[\\/](?:data|vault)|secrets\.json|\.env(?:\.|$))/i.test(line.slice(3))
    );
    if (forbidden) throw new Error('The Builder touched a protected or secret path. The change was not staged or committed.');
    const diff = await git(root, ['diff', '--stat']);
    const evidenceDir = join(this.dataDir, 'evidence', runId);
    mkdirSync(evidenceDir, { recursive: true });
    const testPath = join(evidenceDir, 'test-output.txt');
    const diffPath = join(evidenceDir, 'diff-summary.txt');
    writeFileSync(testPath, testOutput, 'utf8');
    writeFileSync(diffPath, `${status}\n\n${diff}`, 'utf8');
    addEvidence(this.db, runId, `${runId}:automated-tests`, 'test_output', 'test_runner', testPath, 'Project tests passed', testOutput);
    addEvidence(this.db, runId, `${runId}:recorded-change`, 'git_diff', 'git', diffPath, truncate(diff, 500), diff);

    try {
      const checkerRoute = this.router.route('ask', 'auto', selectedEngine.id);
      transitionRun(this.db, runId, 'verifying', 'verifying', `${checkerRoute.selected.displayName} is independently reviewing the diff`);
      const checker = await this.router.run(checkerRoute.selected, {
        runKey: `${runId}:checker`, cwd: root, mode: 'ask', maxBudgetUsd: 0.75,
        prompt: [
          'Review the current uncommitted GROVER diff as an independent checker.',
          'Do not edit files. Look for functional regressions, scope drift, security issues, weak tests, or contradictions with AGENTS.md.',
          'Return concise findings with severity. Model prose is advisory and is not completion evidence.',
          '', diff,
        ].join('\n'),
        onUpdate: (update) => {
          if (update.kind === 'started') transitionRun(this.db, runId, 'verifying', 'verifying', `${checkerRoute.selected.displayName} started the independent review`);
        },
      });
      const checkerPath = join(evidenceDir, 'independent-review.txt');
      writeFileSync(checkerPath, checker.answer, 'utf8');
      transitionRun(this.db, runId, 'verifying', 'verifying', 'Independent review completed', {
        detail: checker.answer,
      });
    } catch (checkerError) {
      transitionRun(this.db, runId, 'verifying', 'verifying', 'Independent model review was unavailable; mechanical checks continue', {
        detail: String(checkerError),
      });
    }

    await git(root, ['add', '--all']);
    const commitMessage = `grover: ${truncate(request, 60).replace(/[\r\n]/g, ' ')}`;
    await git(root, ['commit', '-m', commitMessage]);
    const commitHash = await git(root, ['rev-parse', 'HEAD']);
    recordCommit(this.db, runId, commitHash, branch, commitMessage, diff);
    addEvidence(this.db, runId, `${runId}:recorded-change`, 'commit', 'git', `git:${commitHash}`, `Committed ${commitHash.slice(0, 8)}`, commitHash);
    completeReceipt(this.db, runId, `Estimated $1.00; actual $${result.costUsd.toFixed(4)}; tests passed; commit ${commitHash.slice(0, 8)}`);

    if (!closureReady(this.db, runId)) throw new Error('Verification finished, but the closure invariant rejected the run.');
    transitionRun(this.db, runId, 'passed', 'done', 'The change passed its checks and was committed', {
      actor: 'system', detail: `${result.answer}\n\nCommit: ${commitHash}`,
    });
    if (initialRoute?.decisionId) completeRoutingDecision(this.db, initialRoute.decisionId, `passed:${selectedEngine.id}`);
    this.routingByRun.delete(runId);
    this.changed();
  }

  private handleBuildFailure(runId: string, error: unknown): void {
    const stop = this.stopReasons.get(runId);
    if (stop) {
      this.stopReasons.delete(runId);
      return;
    }
    const run = this.db.prepare('SELECT status, engine_id FROM build_runs WHERE id = ?').get(runId) as { status: string; engine_id: string } | undefined;
    if (!run || ['paused', 'cancelled'].includes(run.status)) return;
    const decisionId = this.routingByRun.get(runId);
    if (decisionId) completeRoutingDecision(this.db, decisionId, `failed:${run.engine_id}`);
    this.routingByRun.delete(runId);
    transitionRun(this.db, runId, 'failed', 'failed', 'The build stopped and needs attention', {
      failure: String(error), detail: String(error),
    });
    this.changed();
  }

  taskAction(taskId: string, action: 'pause' | 'resume' | 'cancel'): void {
    if (!['pause', 'resume', 'cancel'].includes(action)) throw new Error('Unknown task action.');
    const run = this.db.prepare('SELECT id, status FROM build_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 1')
      .get(taskId) as { id: string; status: string } | undefined;
    const key = run?.id ?? taskId;
    if (action === 'cancel') {
      this.stopReasons.set(key, 'cancelled');
      this.router.cancel(key);
      if (run) transitionRun(this.db, run.id, 'cancelled', 'cancelled', 'Cancelled the build');
      else appendTaskProgress(this.db, taskId, 'cancelled', 'Cancelled the request');
    } else if (action === 'pause') {
      if (!run) throw new Error('Only build work can be paused and resumed.');
      this.stopReasons.set(key, 'paused');
      this.router.cancel(key);
      transitionRun(this.db, run.id, 'paused', 'paused', 'Paused the build; it can be resumed');
    } else {
      if (!run || run.status !== 'paused') throw new Error('This build is not paused.');
      const feature = this.db.prepare('SELECT description FROM feature_requests WHERE active_build_run_id = ?').get(run.id) as { description: string };
      this.stopReasons.delete(key);
      void this.runBuild(run.id, feature.description, true).catch((error) => this.handleBuildFailure(run.id, error));
    }
    this.changed();
  }

  setKillSwitch(enabled: boolean): void {
    setSetting(this.db, 'kill_switch', String(enabled));
    if (enabled) {
      const keys = this.router.cancelAll();
      const stoppedBuilds = new Set<string>();
      for (const key of keys) {
        this.stopReasons.set(key, 'killed');
        const build = this.db.prepare('SELECT id FROM build_runs WHERE id = ?').get(key) as { id: string } | undefined;
        if (build) {
          stoppedBuilds.add(build.id);
          transitionRun(this.db, build.id, 'cancelled', 'cancelled', 'Stopped by the kill switch');
        } else {
          appendTaskProgress(this.db, key, 'cancelled', 'Stopped by the kill switch');
        }
      }
      const active = this.db.prepare("SELECT id FROM build_runs WHERE status IN ('queued','running','paused','blocked','verifying')").all() as { id: string }[];
      for (const { id } of active) {
        if (stoppedBuilds.has(id)) continue;
        transitionRun(this.db, id, 'cancelled', 'cancelled', 'Stopped by the kill switch');
      }
    }
    this.changed();
  }

  forget(memoryId: string): void {
    deleteMemory(this.db, memoryId);
    this.changed();
  }

  rateTask(taskId: string, rating: 'positive' | 'negative'): void {
    if (!['positive', 'negative'].includes(rating)) throw new Error('Unknown rating.');
    rateTaskRouting(this.db, taskId, rating);
    this.changed();
  }

  setPreferredEngine(engineId: 'auto' | 'codex-cli' | 'claude-cli'): void {
    if (!['auto', 'codex-cli', 'claude-cli'].includes(engineId)) throw new Error('Unknown engine preference.');
    setSetting(this.db, 'preferred_engine', engineId);
    this.changed();
  }
}

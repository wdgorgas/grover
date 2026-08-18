import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { appendEventInTransaction } from './events.ts';

export const POLICY_TRIGGERS = [
  'real_money',
  'irreversible_or_destructive',
  'jackson_private',
  'self_initiated_grover_change',
  'security_boundary',
] as const;

export type PolicyTrigger = typeof POLICY_TRIGGERS[number];
export type PolicyState = 'required' | 'approved' | 'denied';
export type PolicyOrigin = 'will_direct' | 'grover_self_initiated' | 'imported';

export type PolicyDecision = {
  id: string;
  trigger: PolicyTrigger;
  state: PolicyState;
  reason: string;
  memo: string;
};

const REASONS: Record<PolicyTrigger, string> = {
  real_money: 'This action can spend, transfer, trade, subscribe, or change an approved budget.',
  irreversible_or_destructive: 'This action can destroy data or history outside a verified reversible path.',
  jackson_private: "Jackson's private space is outside GROVER v2.0 authority and always fails closed.",
  self_initiated_grover_change: 'GROVER proposed changing itself without a direct request from Will.',
  security_boundary: 'This action changes authentication, secrets, permissions, exposure, audit, kill-switch, or policy boundaries.',
};

function detectedTriggers(action: string, origin: PolicyOrigin): PolicyTrigger[] {
  const value = action.toLowerCase();
  const found = new Set<PolicyTrigger>();
  if (/\b(buy|purchase|subscribe|subscription|pay|spend|trade|transfer money|increase (?:the )?budget|raise (?:the )?budget)\b/.test(value)) {
    found.add('real_money');
  }
  if (/\b(force[- ]?push|rewrite (?:git )?history|format (?:the )?(?:drive|disk)|drop (?:the )?(?:table|database)|wipe (?:the )?(?:drive|disk)|permanently delete|delete .{0,80}\b(?:outside|unbacked|without a backup))\b/.test(value)) {
    found.add('irreversible_or_destructive');
  }
  if (/\bjackson-private\b/.test(value)) found.add('jackson_private');
  if (origin === 'grover_self_initiated') found.add('self_initiated_grover_change');
  if (/\b(cloudflare access|authentication|auth policy|secret vault|tool permission|sandbox|allowlist|public exposure|expose publicly|public network|write-privileged|prompt injection|kill switch|kill-switch|audit log|policy registry|policyregistry)\b/.test(value)) {
    found.add('security_boundary');
  }
  return POLICY_TRIGGERS.filter((trigger) => found.has(trigger));
}

function memo(trigger: PolicyTrigger, action: string): string {
  const exact = action.replace(/\s+/g, ' ').trim().slice(0, 240);
  return `${REASONS[trigger]} Exact action: ${exact}. Approval applies only to this action; it does not create a broader rule.`;
}

export class PolicyService {
  readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  assess(input: {
    action: string;
    origin: PolicyOrigin;
    explicitlyApproved?: boolean;
    taskId?: string | null;
  }): PolicyDecision[] {
    const triggers = detectedTriggers(input.action, input.origin);
    const now = new Date().toISOString();
    return triggers.map((trigger) => {
      const id = randomUUID();
      const state: PolicyState = trigger === 'jackson_private'
        ? 'denied'
        : input.origin === 'will_direct' && input.explicitlyApproved
          ? 'approved'
          : 'required';
      const reason = REASONS[trigger];
      const compactMemo = memo(trigger, input.action);
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        this.db.prepare(
          `INSERT INTO policy_decisions
            (id, task_id, trigger_id, state, action_summary, reason, memo, origin, created_at, decided_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id, input.taskId ?? null, trigger, state, input.action.slice(0, 2_000), reason, compactMemo,
          input.origin, now, state === 'required' ? null : now,
        );
        this.db.prepare('UPDATE policy_registry SET last_used_at = ? WHERE trigger_id = ?').run(now, trigger);
        appendEventInTransaction(this.db, {
          scopeType: 'policy', scopeId: id, taskId: input.taskId ?? undefined,
          idempotencyKey: `${id}:policy:${state}`, actor: 'system', domain: 'policy', phase: 'policy',
          plainLanguage: state === 'approved'
            ? `Applied Will's narrow approval for ${trigger.replaceAll('_', ' ')}`
            : state === 'denied'
              ? `Denied ${trigger.replaceAll('_', ' ')}`
              : `Paused for ${trigger.replaceAll('_', ' ')} approval`,
          internalDetail: JSON.stringify({ trigger, state, memo: compactMemo }), signoffState: state,
        });
        this.db.exec('COMMIT;');
      } catch (error) {
        this.db.exec('ROLLBACK;');
        throw error;
      }
      return { id, trigger, state, reason, memo: compactMemo };
    });
  }
}

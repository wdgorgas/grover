/**
 * Model Router + Cost Governor (master prompt §11).
 *
 * Rule-based v1: abstract capability tiers (fast/smart/frontier/fable) map to
 * configurable model IDs. Default assumption is the CHEAP model — tasks earn
 * their way up the ladder, not the reverse.
 *
 * The Cost Governor enforces budgets that actually block: if a call would
 * push spend past the daily/monthly cap, it requires an explicit override
 * (which is audited).
 */
import { getSettings, one } from './db.mjs';

export const TIERS = ['fast', 'smart', 'frontier', 'fable'];

/** Rough token estimate: ~4 chars/token. Good enough for pre-call gating. */
export function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/**
 * Pick a tier for a task.
 * Internal plumbing (extraction, titling, tagging) is ALWAYS fast-tier.
 * User chat defaults to smart. Frontier/fable are opt-in via the UI —
 * per §11.4, frontier models are never spent on routine turns automatically.
 */
export function routeTier({ taskType, requestedTier }) {
  if (requestedTier && TIERS.includes(requestedTier)) return requestedTier;
  const internal = ['brain_dump_extract', 'title', 'memory_tag', 'classify'];
  if (internal.includes(taskType)) return 'fast';
  return 'smart';
}

export function modelForTier(tier) {
  const s = getSettings();
  return s.models[tier] || s.models.smart;
}

export function maxTokensForTier(tier) {
  const s = getSettings();
  return s.maxOutputTokens[tier] || 2048;
}

/** Compute real cost in USD from API-reported usage. */
export function computeCost(tier, usage) {
  const p = getSettings().pricing[tier] || { in: 2, out: 10 };
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  return (
    inTok * p.in +
    outTok * p.out +
    cacheRead * p.in * 0.1 +   // cache reads ≈ 0.1x input price
    cacheWrite * p.in * 1.25   // cache writes ≈ 1.25x input price
  ) / 1e6;
}

export function estimateCost(tier, inputTokens, maxOutputTokens) {
  const p = getSettings().pricing[tier] || { in: 2, out: 10 };
  // Assume ~40% of the output budget gets used, for a realistic pre-check.
  return (inputTokens * p.in + maxOutputTokens * 0.4 * p.out) / 1e6;
}

// ---- Budget gate -------------------------------------------------------------

export function spend(window) {
  // window: 'day' | 'week' | 'month'
  const clause = {
    day: `date(created_at) = date('now')`,
    week: `created_at >= datetime('now', '-7 days')`,
    month: `strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
  }[window];
  return one(`SELECT COALESCE(SUM(cost), 0) AS c FROM model_calls WHERE ${clause}`).c;
}

/**
 * Returns { ok: true } or { ok: false, reason, spentToday, spentMonth, caps }.
 * The caller decides whether to surface an approval gate or hard-fail.
 */
export function checkBudget(estimatedCost) {
  const { budgets } = getSettings();
  const spentToday = spend('day');
  const spentMonth = spend('month');
  const caps = { dailyUsd: budgets.dailyUsd, monthlyUsd: budgets.monthlyUsd };
  if (spentToday + estimatedCost > budgets.dailyUsd) {
    return { ok: false, reason: 'daily_cap', spentToday, spentMonth, caps };
  }
  if (spentMonth + estimatedCost > budgets.monthlyUsd) {
    return { ok: false, reason: 'monthly_cap', spentToday, spentMonth, caps };
  }
  return { ok: true, spentToday, spentMonth, caps };
}

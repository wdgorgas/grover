/**
 * Build-loop UI (docs/LOOP_ENGINEERING.md): the two doors into a loop plus
 * the Builder surfaces that track it.
 *
 *  - improvementFlow(): free text → structured proposal → approve / edit /
 *    save for later / reject. Approval creates ledger item + loop together.
 *  - greenlightFlow(): existing ledger item → proposal → approval → loop.
 *  - renderSystemStrip() / renderLoopsPanel(): active, queued, blocked, and
 *    recently completed loops, each with an auditable event timeline.
 *
 * Honest about autonomy: at L1 nothing executes — approving creates the
 * plan-of-record a human (or a supervised session) works from.
 */
import { api, esc, toast, modal, closeModal, promptModal, fmtDate } from './api.js';

const RISK_COLOR = { low: 'var(--state-ok)', medium: 'var(--state-warn)', high: 'var(--state-err)' };

// ---- Shared proposal renderer (read-only summary rows) ---------------------------

function proposalFacts(p) {
  return `
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px" class="small">
      <span><b style="color:${RISK_COLOR[p.risk] || 'var(--text)'}">${esc(p.risk)} risk</b>
        ${p.risk_notes ? `<span class="dim"> — ${esc(p.risk_notes)}</span>` : ''}</span>
      ${p.effort_hours != null ? `<span class="dim">~${p.effort_hours}h effort</span>` : ''}
      ${p.cost_estimate ? `<span class="dim">est: ${esc(p.cost_estimate)}</span>` : ''}
      ${p.touches?.length ? `<span class="dim mono">touches: ${p.touches.map(esc).join(', ')}</span>` : ''}
    </div>
    ${p.verification?.length ? `<label class="f">Verification</label>
      <ul class="small" style="margin:4px 0 0;padding-left:18px">
        ${p.verification.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}
    ${p.rollback ? `<div class="small dim" style="margin-top:8px"><b>Rollback:</b> ${esc(p.rollback)}</div>` : ''}`;
}

function autonomyCallout(r) {
  return `<div class="callout" style="margin-top:14px">
    <b>Autonomy L${r.autonomy_level}.</b> ${esc(r.approval)}
  </div>`;
}

function offlineCallout(r) {
  return r.offline ? `<div class="callout" style="border-color:color-mix(in srgb, var(--state-warn) 45%, var(--border))">
    <b>Offline skeleton.</b> ${esc(r.offlineReason)}</div>` : '';
}

// ---- Improvement Request flow ------------------------------------------------------

export function improvementFlow(onDone) {
  const m = modal(`
    <p class="view-kicker">improvement request</p>
    <h2 style="margin-top:2px">What should Grover build?</h2>
    <p class="small dim" style="margin-top:6px">Describe the change in plain words — a feature, a fix, an annoyance.
    Grover turns it into a structured proposal (goal, scope, plan, risk, verification, rollback) that you can
    edit, approve, save for later, or reject. Nothing is created until you decide.</p>
    <label class="f">The improvement</label>
    <textarea class="field" id="ir-text" rows="3" style="width:100%"
      placeholder="e.g. add a way to delete chats from the sidebar · make task widgets draggable · keyboard shortcut to focus the command input · better empty state on the Ledger"></textarea>
    <div class="row">
      <button class="ghost" data-a="cancel">Cancel</button>
      <button class="primary" data-a="draft">Draft proposal →</button>
    </div>`);
  m.querySelector('[data-a=cancel]').onclick = closeModal;
  m.querySelector('[data-a=draft]').onclick = async () => {
    const request = m.querySelector('#ir-text').value.trim();
    if (!request) return;
    const btn = m.querySelector('[data-a=draft]');
    btn.disabled = true;
    btn.textContent = 'Grover is drafting…';
    let r;
    try {
      r = await api('/api/improvements/propose', { method: 'POST', body: { request } });
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
      btn.textContent = 'Draft proposal →';
      return;
    }
    proposalEditor(m, r, request, onDone);
  };
}

/** Editable proposal form. Every field the user approves is a field they could change. */
function proposalEditor(m, r, request, onDone) {
  const p = r.proposal;
  const lines = (arr) => (arr || []).join('\n');
  const scopeLines = lines([...(p.scope || []), ...(p.out_of_scope || []).map((s) => `OUT: ${s}`)]);
  m.innerHTML = `
    <p class="view-kicker">improvement proposal · review &amp; edit</p>
    ${offlineCallout(r)}
    <label class="f">Work item title</label>
    <input type="text" id="pe-title" style="width:100%" value="${esc(r.draft.title)}">
    <label class="f">Goal (one sentence)</label>
    <input type="text" id="pe-goal" style="width:100%" value="${esc(p.goal)}">
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <div><label class="f">Category</label>
        <select id="pe-cat">${['feature', 'bug', 'upgrade', 'repair', 'decision'].map((c) =>
          `<option ${r.draft.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label class="f">Severity</label>
        <select id="pe-sev">${['low', 'medium', 'high', 'urgent'].map((s) =>
          `<option ${r.draft.severity === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label class="f">Risk</label>
        <select id="pe-risk">${['low', 'medium', 'high'].map((s) =>
          `<option ${p.risk === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div style="flex:1;min-width:160px"><label class="f">Cost estimate</label>
        <input type="text" id="pe-cost" style="width:100%" value="${esc(p.cost_estimate || '')}" placeholder="e.g. $0 API / ~1h human"></div>
    </div>
    <label class="f">Scope — one per line (prefix out-of-scope lines with OUT:)</label>
    <textarea class="field" id="pe-scope" rows="3" style="width:100%">${esc(scopeLines)}</textarea>
    <label class="f">Plan — one step per line</label>
    <textarea class="field" id="pe-steps" rows="5" style="width:100%">${esc(lines(p.steps))}</textarea>
    <label class="f">Verification — checks that prove it worked, one per line</label>
    <textarea class="field" id="pe-verify" rows="3" style="width:100%">${esc(lines(p.verification))}</textarea>
    <label class="f">Rollback</label>
    <input type="text" id="pe-rollback" style="width:100%" value="${esc(p.rollback || '')}">
    ${autonomyCallout(r)}
    <div class="row">
      <button class="danger" data-a="reject" title="Discard — the rejection itself is audited">Reject</button>
      <span style="flex:1"></span>
      <button class="ghost" data-a="save" title="Log it as a pending ledger item you can greenlight later">Save for later</button>
      <button class="primary" data-a="approve">Approve &amp; queue loop</button>
    </div>`;

  const collect = () => {
    const splitLines = (id) => m.querySelector(id).value.split('\n').map((s) => s.trim()).filter(Boolean);
    const allScope = splitLines('#pe-scope');
    return {
      draft: {
        title: m.querySelector('#pe-title').value.trim() || request.slice(0, 100),
        category: m.querySelector('#pe-cat').value,
        severity: m.querySelector('#pe-sev').value,
      },
      proposal: {
        ...p,
        goal: m.querySelector('#pe-goal').value.trim() || r.draft.title,
        scope: allScope.filter((s) => !/^out:/i.test(s)),
        out_of_scope: allScope.filter((s) => /^out:/i.test(s)).map((s) => s.replace(/^out:\s*/i, '')),
        steps: splitLines('#pe-steps'),
        verification: splitLines('#pe-verify'),
        rollback: m.querySelector('#pe-rollback').value.trim(),
        cost_estimate: m.querySelector('#pe-cost').value.trim(),
        risk: m.querySelector('#pe-risk').value,
      },
    };
  };

  const decide = async (decision) => {
    try {
      const body = { decision, request, offline: r.offline, ...collect() };
      const out = await api('/api/improvements', { method: 'POST', body });
      closeModal();
      if (decision === 'approve') {
        toast(`Loop #${out.loop.id} queued. Nothing runs on its own — work it from the Builder.`, 'ok');
      } else if (decision === 'save') {
        toast(`Saved as ledger item #${out.itemId} — greenlight it whenever you're ready.`, 'ok');
      } else {
        toast('Rejected — nothing created (the decision is audited).');
      }
      onDone?.();
    } catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('[data-a=approve]').onclick = () => decide('approve');
  m.querySelector('[data-a=save]').onclick = () => decide('save');
  m.querySelector('[data-a=reject]').onclick = () => decide('reject');
}

// ---- Greenlight flow (same philosophy, entered from an existing ledger item) ------

export async function greenlightFlow(itemId, onDone) {
  const m = modal(`<h2>Greenlight</h2><p class="dim">Grover is drafting the build proposal…</p>`);
  let r;
  try {
    r = await api(`/api/ledger/${itemId}/proposal`, { method: 'POST' });
  } catch (err) {
    closeModal();
    toast(err.message, 'err');
    return;
  }
  if (r.alreadyLooped) {
    closeModal();
    toast(`Already has an open loop (#${r.loop.id}, ${r.loop.status}).`);
    onDone?.();
    return;
  }
  const p = r.proposal;
  m.innerHTML = `
    <p class="view-kicker">build proposal · ledger #${itemId}</p>
    <h2 style="margin-top:2px">${esc(p.goal)}</h2>
    ${offlineCallout(r)}
    <label class="f">Scope</label>
    <ul class="small" style="margin:4px 0 0;padding-left:18px">
      ${p.scope.map((s) => `<li>${esc(s)}</li>`).join('')}
      ${(p.out_of_scope || []).map((s) => `<li class="faint">Out: ${esc(s)}</li>`).join('')}
    </ul>
    <label class="f">Plan</label>
    <ol class="small" style="margin:4px 0 0;padding-left:18px">
      ${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}
    </ol>
    ${proposalFacts(p)}
    ${autonomyCallout(r)}
    <div class="row">
      <button class="ghost" data-a="no">Not now</button>
      <button class="primary" data-a="yes">Approve &amp; queue loop</button>
    </div>`;
  m.querySelector('[data-a=no]').onclick = closeModal;
  m.querySelector('[data-a=yes]').onclick = async () => {
    try {
      const ok = await api(`/api/ledger/${itemId}/approve`, {
        method: 'POST',
        body: { proposal: p, offline: r.offline },
      });
      closeModal();
      toast(`Loop #${ok.loop.id} queued. Nothing runs on its own — work it from the Builder.`, 'ok');
      onDone?.();
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ---- System state strip (Builder header; mirrors /api/status) -------------------

export async function renderSystemStrip(el) {
  if (!el) return;
  let s;
  try { s = await api('/api/status'); } catch { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="cards-row" style="margin-bottom:16px">
      <div class="stat"><label>Autonomy</label><div class="v">L${s.autonomyLevel}</div>
        <div class="sub">executes at L${s.executionLevel} — human approves everything</div></div>
      <div class="stat"><label>Today</label><div class="v">$${s.spend.today.toFixed(2)}</div>
        <div class="sub">cap $${s.spend.dailyCap}</div></div>
      <div class="stat"><label>Active loop</label>
        <div class="v" style="font-size:15px;line-height:1.3">${s.activeLoop
          ? `#${s.activeLoop.id} · ${esc(s.activeLoop.status)}`
          : '<span class="faint">none</span>'}</div>
        <div class="sub">${s.activeLoop ? esc(s.activeLoop.goal.slice(0, 60)) : 'request an improvement to start one'}</div></div>
      <div class="stat"><label>Queue</label><div class="v">${s.counts.queuedLoops}</div>
        <div class="sub">${s.counts.pendingGreenlight} awaiting greenlight${s.counts.blockedLoops
          ? ` · <span style="color:var(--state-err)">${s.counts.blockedLoops} blocked</span>` : ''}</div></div>
    </div>
    <div class="callout"><b>Next:</b> ${s.nextActions.map(esc).join(' · ')}</div>`;
}

// ---- Loops panel (Builder) --------------------------------------------------------

/** Legal UI actions per status — mirrors LOOP_TRANSITIONS server-side. */
const LOOP_ACTIONS = {
  approved: [['ready', '→ Ready', 'ghost', 'Prerequisites are clear — it can be picked up any time'],
    ['running', '▶ Start', 'ok', 'Start working this loop now']],
  ready: [['running', '▶ Start', 'ok', 'Start working this loop now'],
    ['blocked', '⛔ Block', 'ghost', 'Something is in the way — record why']],
  running: [['verifying', '⇢ Verify', 'ghost', 'Work done — run the verification checks'],
    ['blocked', '⛔ Block', 'ghost', 'Something is in the way — record why']],
  verifying: [['done', '✓ Done', 'ok', 'Verification passed — close with a summary'],
    ['running', '↩ Reopen', 'ghost', 'Verification failed — back to work'],
    ['blocked', '⛔ Block', 'ghost', 'Something is in the way — record why']],
  blocked: [['ready', '◈ Unblock', 'ok', 'Blocker cleared — back in the queue']],
};

const STATUS_BADGE = {
  approved: 'b-approved', ready: 'b-approved', running: 'b-pending_greenlight',
  verifying: 'b-pending_greenlight', blocked: 'b-rejected',
  done: 'b-done', killed: 'b-deferred', rejected: 'b-rejected',
};

function loopCard(l, { featured = false } = {}) {
  const actions = (LOOP_ACTIONS[l.status] || []).map(([st, label, cls, title]) =>
    `<button class="${cls}" data-loop="${l.id}" data-st="${st}" title="${esc(title)}">${label}</button>`).join('');
  return `
    <div class="card" ${featured ? 'style="border-color:color-mix(in srgb, var(--accent) 40%, var(--border))"' : ''}>
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div style="min-width:0">
          <b>#${l.id} · ${esc(l.goal)}</b>
          <div class="small faint" style="margin-top:4px">
            <span class="badge ${STATUS_BADGE[l.status] || ''}">${esc(l.status)}</span>
            <span class="badge" style="color:${RISK_COLOR[l.risk]}">${esc(l.risk)} risk</span>
            ${l.source === 'improvement' ? '<span class="badge">improvement request</span>' : ''}
            ${l.offline ? '<span class="badge">offline proposal</span>' : ''}
            ${l.effort_hours != null ? `<span class="badge">~${l.effort_hours}h</span>` : ''}
            ${l.cost_estimate ? `<span class="badge">${esc(l.cost_estimate)}</span>` : ''}
            · ledger #${l.ledger_id}
          </div>
          ${l.status === 'blocked' && l.blocked_reason
            ? `<div class="small" style="margin-top:6px;color:var(--state-err)">⛔ ${esc(l.blocked_reason)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          ${actions}
          <button class="ghost" data-open="${l.ledger_id}" title="Open the source item's brief and workshop">Workshop ↗</button>
          <button class="danger" data-loop="${l.id}" data-st="killed" title="Kill this loop" aria-label="Kill loop">✕</button>
        </div>
      </div>
      ${l.status === 'verifying' && l.verify_plan.length ? `
        <div class="small" style="margin-top:8px">
          <b>Verification checklist</b> — all must hold before ✓ Done:
          <ul style="margin:4px 0 0;padding-left:18px">${l.verify_plan.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
        </div>` : ''}
      <details style="margin-top:8px"><summary class="small dim" style="cursor:pointer">Plan (${l.steps.length} steps)</summary>
        <ol class="small" style="margin:6px 0 0;padding-left:18px">${l.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        ${l.scope.length ? `<div class="small faint" style="margin-top:6px">Scope: ${l.scope.map(esc).join(' · ')}</div>` : ''}
        ${l.verify_plan.length && l.status !== 'verifying' ? `<div class="small faint" style="margin-top:6px">Verify: ${l.verify_plan.map(esc).join(' · ')}</div>` : ''}
        ${l.rollback ? `<div class="small faint" style="margin-top:6px">Rollback: ${esc(l.rollback)}</div>` : ''}
      </details>
      <details style="margin-top:4px" data-events="${l.id}"><summary class="small dim" style="cursor:pointer">History</summary>
        <div class="small dim" data-events-body="${l.id}" style="margin-top:6px">Loading…</div>
      </details>
    </div>`;
}

export async function renderLoopsPanel(el, onChange, onOpenItem) {
  if (!el) return;
  let loops;
  try { loops = await api('/api/loops'); } catch { el.innerHTML = ''; return; }
  const by = (statuses) => loops.filter((l) => statuses.includes(l.status));
  const active = by(['running', 'verifying']);
  const queued = by(['approved', 'ready']);
  const blocked = by(['blocked']);
  const closed = loops.filter((l) => ['done', 'killed', 'rejected'].includes(l.status));

  if (!loops.length) {
    el.innerHTML = `<h2>Build loops</h2>
      <div class="empty-state"><b>No loops yet.</b>
      <p class="dim small">A loop is a tracked, auditable unit of Grover's self-development: proposal → your
      approval → work → verification → done. Two ways to start one: hit <b>✦ Request improvement</b> above and
      describe what you want in plain words, or ✓ Greenlight a pending item below. Nothing ever runs without
      your approval.</p></div>`;
    return;
  }

  const section = (title, rows, opts = {}) => rows.length
    ? `<h2>${title}</h2>` + rows.map((l) => loopCard(l, opts)).join('') : '';

  el.innerHTML = `<h2>Build loops</h2>`
    + (active.length ? active.map((l) => loopCard(l, { featured: true })).join('')
      : `<p class="small dim">No loop is being worked right now${queued.length ? ' — start one from the queue below' : ''}.</p>`)
    + section('Queued improvements', queued)
    + section('Blocked — needs you', blocked)
    + (closed.length ? `
      <details class="history"><summary>Recently completed — ${closed.length} closed loop${closed.length === 1 ? '' : 's'}</summary>
        ${closed.slice(0, 8).map((l) => `
          <div class="card">
            <b>#${l.id} · ${esc(l.goal)}</b>
            <div class="small faint" style="margin-top:4px">
              <span class="badge ${STATUS_BADGE[l.status]}">${esc(l.status)}</span>
              ${fmtDate(l.updated_at)} · ledger #${l.ledger_id}
            </div>
            <div class="small ${l.summary ? 'dim' : 'faint'}" style="margin-top:6px">
              ${l.summary ? esc(l.summary) : 'No closing summary recorded.'}</div>
            <details style="margin-top:4px" data-events="${l.id}"><summary class="small dim" style="cursor:pointer">History</summary>
              <div class="small dim" data-events-body="${l.id}" style="margin-top:6px">Loading…</div>
            </details>
          </div>`).join('')}
      </details>` : '');

  el.querySelectorAll('button[data-open]').forEach((b) => {
    b.onclick = () => onOpenItem?.(Number(b.dataset.open));
  });

  // Per-loop event timeline, fetched lazily when History is opened.
  el.querySelectorAll('details[data-events]').forEach((d) => {
    d.addEventListener('toggle', async () => {
      if (!d.open || d.dataset.loaded) return;
      d.dataset.loaded = '1';
      const body = el.querySelector(`[data-events-body="${d.dataset.events}"]`);
      try {
        const events = await api(`/api/loops/${d.dataset.events}/events`);
        body.innerHTML = events.length ? events.map((e) => `
          <div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid var(--border)">
            <span class="mono faint" style="flex-shrink:0">${fmtDate(e.created_at)}</span>
            <span style="flex-shrink:0">${e.event === 'proposed' ? 'proposed'
              : `${esc(e.from_status || '·')} → <b>${esc(e.to_status)}</b>`}</span>
            <span class="faint">${e.actor ? esc(e.actor) : ''}${e.note ? ` — ${esc(e.note)}` : ''}</span>
          </div>`).join('')
          : 'No events recorded (loop predates event tracking).';
      } catch { body.textContent = 'Could not load history.'; }
    });
  });

  el.querySelectorAll('button[data-loop]').forEach((b) => {
    b.onclick = async () => {
      let summary, reason;
      if (b.dataset.st === 'killed') {
        summary = await promptModal('Kill this loop', 'One line: why is it being killed?', 'superseded / not worth it / …');
        if (summary === null) return;
      }
      if (b.dataset.st === 'blocked') {
        reason = await promptModal('Block this loop', 'What is in the way? (shown until unblocked)', 'waiting on API key / needs a decision on X / …');
        if (reason === null || !reason) return;
      }
      if (b.dataset.st === 'done') {
        summary = (await promptModal('Close the loop', 'One line: what changed, and what remains? (stored as the loop summary)', 'shipped X, verified by Y; Z left for later')) || undefined;
      }
      try {
        await api(`/api/loops/${b.dataset.loop}/status`, {
          method: 'POST', body: { status: b.dataset.st, summary, reason },
        });
        toast(`Loop #${b.dataset.loop} → ${b.dataset.st}.`, 'ok');
        onChange?.();
      } catch (err) { toast(err.message, 'err'); }
    };
  });
}

// ---- Desk starter prompts (beginner clarity) -----------------------------------------

const STARTERS = {
  Research: [
    'Map the open questions in [topic] — organization only, no conclusions',
    'Steelman both sides of [claim] and name the cruxes',
    'What would falsify [my hypothesis]? Design the cheapest test',
  ],
  Business: [
    'Convert this viral claim into a testable experiment: [paste claim]',
    'Write kill criteria for [idea] before I fall in love with it',
    'Estimate honest startup + recurring costs for [idea]',
  ],
  Coding: [
    'Debug this error with me: [paste error]',
    'Review this function for edge cases: [paste code]',
    'Design the smallest possible schema for [feature]',
  ],
  Lifestyle: [
    'Build a weekly plan for [goal] I will actually keep',
    'Break [goal] into a 30-day plan with checkpoints',
    'What should I track weekly to notice real progress on [habit]?',
  ],
};

export function deskStarters(deskName, input) {
  const prompts = STARTERS[deskName] || [
    `What can the ${deskName} desk do? Give me three example tasks`,
  ];
  const wrap = document.createElement('div');
  wrap.className = 'sys-card';
  wrap.innerHTML = `<h4>Not sure where to start?</h4>
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
      ${prompts.map((p) => `<button class="ghost" style="text-align:left" data-p="${esc(p)}">${esc(p)}</button>`).join('')}
    </div>`;
  wrap.querySelectorAll('[data-p]').forEach((b) => {
    b.onclick = () => {
      input.value = b.dataset.p;
      input.focus();
      input.dispatchEvent(new Event('input'));
    };
  });
  return wrap;
}

/**
 * Greenlight Build Loop UI + system state surfaces (docs/LOOP_ENGINEERING.md).
 *
 * greenlightFlow(): proposal → human approval → tracked loop. Honest about
 * autonomy: at L1 nothing executes — approving creates the plan-of-record.
 */
import { api, esc, toast, modal, closeModal, promptModal } from './api.js';

const RISK_COLOR = { low: 'var(--state-ok)', medium: 'var(--state-warn)', high: 'var(--state-err)' };

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
    ${r.offline ? `<div class="callout" style="border-color:color-mix(in srgb, var(--state-warn) 45%, var(--border))">
      <b>Offline skeleton.</b> ${esc(r.offlineReason)}</div>` : ''}
    <label class="f">Scope</label>
    <ul class="small" style="margin:4px 0 0;padding-left:18px">
      ${p.scope.map((s) => `<li>${esc(s)}</li>`).join('')}
      ${(p.out_of_scope || []).map((s) => `<li class="faint">Out: ${esc(s)}</li>`).join('')}
    </ul>
    <label class="f">Plan</label>
    <ol class="small" style="margin:4px 0 0;padding-left:18px">
      ${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}
    </ol>
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:14px" class="small">
      <span><b style="color:${RISK_COLOR[p.risk] || 'var(--text)'}">${esc(p.risk)} risk</b>
        ${p.risk_notes ? `<span class="dim"> — ${esc(p.risk_notes)}</span>` : ''}</span>
      ${p.effort_hours != null ? `<span class="dim">~${p.effort_hours}h effort</span>` : ''}
      ${p.touches?.length ? `<span class="dim mono">touches: ${p.touches.map(esc).join(', ')}</span>` : ''}
    </div>
    <div class="callout" style="margin-top:14px">
      <b>Autonomy L${r.autonomy_level}.</b> ${esc(r.approval)}
    </div>
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
        <div class="sub">${s.activeLoop ? esc(s.activeLoop.goal.slice(0, 60)) : 'greenlight an item to start one'}</div></div>
      <div class="stat"><label>Queue</label><div class="v">${s.counts.queuedLoops}</div>
        <div class="sub">${s.counts.pendingGreenlight} awaiting greenlight</div></div>
    </div>
    <div class="callout"><b>Next:</b> ${s.nextActions.map(esc).join(' · ')}</div>`;
}

// ---- Loops panel (Builder) --------------------------------------------------------

const LOOP_ACTIONS = {
  approved: [['running', '▶ Start', 'ok']],
  running: [['verifying', '⇢ Verify', 'ghost']],
  verifying: [['done', '✓ Done', 'ok'], ['running', '↩ Reopen', 'ghost']],
};

export async function renderLoopsPanel(el, onChange, onOpenItem) {
  if (!el) return;
  let loops;
  try { loops = await api('/api/loops'); } catch { el.innerHTML = ''; return; }
  const open = loops.filter((l) => !['done', 'killed'].includes(l.status));
  const closed = loops.length - open.length;
  if (!loops.length) {
    el.innerHTML = `<h2>Build loops</h2>
      <div class="card"><b>No loops yet.</b>
      <div class="small dim" style="margin-top:4px">Greenlight a pending item below — Grover drafts a proposal,
      you approve it, and it becomes a tracked loop here. That's the whole rhythm of this app:
      <span class="mono">log → greenlight → work the loop → done</span>.</div></div>`;
    return;
  }
  el.innerHTML = `<h2>Build loops</h2>` + open.map((l) => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div style="min-width:0">
          <b>#${l.id} · ${esc(l.goal)}</b>
          <div class="small faint" style="margin-top:4px">
            <span class="badge b-${l.status === 'approved' ? 'approved' : l.status === 'verifying' ? 'pending_greenlight' : 'done'}">${esc(l.status)}</span>
            <span class="badge" style="color:${RISK_COLOR[l.risk]}">${esc(l.risk)} risk</span>
            ${l.offline ? '<span class="badge">offline proposal</span>' : ''}
            ${l.effort_hours != null ? `<span class="badge">~${l.effort_hours}h</span>` : ''}
            · ledger #${l.ledger_id}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          ${(LOOP_ACTIONS[l.status] || []).map(([st, label, cls]) =>
            `<button class="${cls}" data-loop="${l.id}" data-st="${st}">${label}</button>`).join('')}
          <button class="ghost" data-open="${l.ledger_id}" title="Open the source item's brief and workshop">Workshop ↗</button>
          <button class="danger" data-loop="${l.id}" data-st="killed" title="Kill this loop" aria-label="Kill loop">✕</button>
        </div>
      </div>
      <details style="margin-top:8px"><summary class="small dim" style="cursor:pointer">Plan (${l.steps.length} steps)</summary>
        <ol class="small" style="margin:6px 0 0;padding-left:18px">${l.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        ${l.scope.length ? `<div class="small faint" style="margin-top:6px">Scope: ${l.scope.map(esc).join(' · ')}</div>` : ''}
      </details>
    </div>`).join('')
    + (closed ? `<p class="small faint">${closed} closed loop${closed === 1 ? '' : 's'} in history (Audit has the trail).</p>` : '');

  el.querySelectorAll('button[data-open]').forEach((b) => {
    b.onclick = () => onOpenItem?.(Number(b.dataset.open));
  });
  el.querySelectorAll('button[data-loop]').forEach((b) => {
    b.onclick = async () => {
      let summary;
      if (b.dataset.st === 'killed') {
        summary = await promptModal('Kill this loop', 'One line: why is it being killed?', 'superseded / not worth it / …');
        if (summary === null) return;
      }
      if (b.dataset.st === 'done') {
        summary = (await promptModal('Close the loop', 'One line: what changed? (stored as the loop summary)', 'shipped X, verified by Y')) || undefined;
      }
      try {
        await api(`/api/loops/${b.dataset.loop}/status`, {
          method: 'POST', body: { status: b.dataset.st, summary },
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

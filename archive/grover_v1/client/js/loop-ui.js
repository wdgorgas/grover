/**
 * Build-loop UI (docs/LOOP_ENGINEERING.md, AGENT_POLICY.md).
 *
 *  - improvementFlow(): Path 1 — a typed request executes immediately via
 *    /api/execute, streaming real runner progress. No proposal step.
 *  - greenlightFlow(): existing ledger item → proposal → approval → loop
 *    (Path 2 machinery; also how saved Grover-initiated items get queued).
 *  - streamExecution(): shared SSE progress renderer for the runner.
 *  - renderSystemStrip() / renderLoopsPanel(): active, queued, blocked, and
 *    recently completed loops, each with an auditable event timeline.
 *
 * Honesty rules: progress lines come from real runner events only; loops
 * cannot be marked done without evidence (runner or written attestation);
 * without an API key the runner blocks and says so.
 */
import { api, streamTurn, esc, toast, modal, closeModal, promptModal, fmtDate } from './api.js';

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

// ---- Live progress for a running loop (dashboard card, not just the creation modal) -----
//
// The runner writes every tool call to loop_events in real time regardless of
// whether anyone's watching the creation modal's SSE stream — so a card can
// show real progress just by polling that history. Closing the modal (or
// reloading the page) used to mean losing all visibility into a run that was
// still working in the background; this is the fix.

let progressPollTimer = null;
let progressPollLoopId = null;

function stopProgressPoll() {
  if (progressPollTimer) clearInterval(progressPollTimer);
  progressPollTimer = null;
  progressPollLoopId = null;
}

function startProgressPoll(container, loopId) {
  if (progressPollLoopId === loopId) return; // already polling this one
  stopProgressPoll();
  progressPollLoopId = loopId;
  const tick = async () => {
    const zone = container.querySelector(`[data-progress="${loopId}"]`);
    if (!zone) { stopProgressPoll(); return; } // card is gone — rerendered or navigated away
    try {
      const events = await api(`/api/loops/${loopId}/events`);
      const tail = events.filter((e) => e.event === 'exec').slice(-4);
      zone.innerHTML = tail.length
        ? tail.map((e) => `<div class="mono small dim">· ${esc(e.note || '')}</div>`).join('')
        : '<div class="small faint">runner starting…</div>';
    } catch { /* best-effort; leave last-known progress on screen */ }
  };
  tick();
  progressPollTimer = setInterval(tick, 2500);
}

// ---- Runner progress (shared by the direct-request modal and ▶ Execute) -----------

/**
 * Stream a /api/execute run into a container as live progress lines.
 * Every line is a real server event — nothing simulated.
 * Returns the final event ({type:'done'|'error'}) or null if the stream died.
 */
export async function streamExecution(container, body) {
  container.innerHTML = `
    <pre class="mono small" data-run-log style="white-space:pre-wrap;max-height:320px;overflow-y:auto;
      background:var(--bg-2);padding:10px;border-radius:8px;margin-top:8px">runner starting…</pre>`;
  const log = container.querySelector('[data-run-log]');
  let first = true;
  const line = (s) => {
    log.textContent = first ? s : `${log.textContent}\n${s}`;
    first = false;
    log.scrollTop = log.scrollHeight;
  };
  let final = null;
  try {
    await streamTurn('/api/execute', body, (ev) => {
      switch (ev.type) {
        case 'loop':
          line(`loop #${ev.loopId} · ledger #${ev.ledgerId} — running`);
          break;
        case 'runner':
          if (ev.state === 'model') line(`[${ev.iteration}/${ev.max || 20}] model call…`);
          else if (ev.state === 'model_done') line(`  ↳ $${(ev.cost || 0).toFixed(4)} · ${ev.stopReason || ''}`);
          else if (ev.state === 'verify') line('final verify battery…');
          break;
        case 'exec':
          line(`  ${ev.error ? '✗' : '·'} ${ev.note || ev.tool}`);
          break;
        case 'done':
          final = ev;
          line(`→ ${ev.status}${ev.reason ? ` — ${ev.reason}` : ''}`);
          break;
        case 'error':
          final = ev;
          line(`error: ${ev.message}`);
          break;
      }
    });
  } catch (err) {
    line(`stream failed: ${err.message}`);
  }
  if (!final) line('stream ended without a result — check the loop\'s History.');
  return final;
}

// ---- Direct request flow (Path 1: typed by a human → executes now) -----------------

export function improvementFlow(onDone) {
  const m = modal(`
    <p class="view-kicker">direct request · path 1</p>
    <h2 style="margin-top:2px">What should Grover build?</h2>
    <p class="small dim" style="margin-top:6px">You typed it, so it runs: Grover's runner works the repo with
    real tools, runs the verify battery, and attaches evidence (files changed, diffs, verify output) for your
    review. Budget gates still apply. Grover-initiated proposals still queue for approval — that path is
    reserved for work Grover surfaces on its own.</p>
    <label class="f">The request</label>
    <textarea class="field" id="ir-text" rows="3" style="width:100%"
      placeholder="e.g. add a way to delete chats from the sidebar · make task widgets draggable · keyboard shortcut to focus the command input"></textarea>
    <div class="row">
      <button class="ghost" data-a="cancel">Cancel</button>
      <button class="primary" data-a="run">▶ Execute now</button>
    </div>
    <div data-run-zone></div>`);
  m.querySelector('[data-a=cancel]').onclick = closeModal;
  m.querySelector('[data-a=run]').onclick = async () => {
    const request = m.querySelector('#ir-text').value.trim();
    if (!request) return;
    const btn = m.querySelector('[data-a=run]');
    btn.disabled = true;
    btn.textContent = 'Runner working…';
    m.querySelector('#ir-text').disabled = true;
    const final = await streamExecution(m.querySelector('[data-run-zone]'), { request });
    btn.remove();
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<button class="primary" data-a="close">Close</button>`;
    m.appendChild(row);
    row.querySelector('[data-a=close]').onclick = () => { closeModal(); onDone?.(); };
    if (final?.status === 'verifying') toast('Run finished — evidence attached, review and mark done.', 'ok');
    else if (final) toast(final.reason || final.message || `Run ended: ${final.status || 'error'}.`, 'err');
  };
}

// ---- Greenlight flow (proposal-then-approval, entered from an existing ledger item) ------

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
      toast(`Loop #${ok.loop.id} queued. ▶ Execute it from the item, or work it by hand.`, 'ok');
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
        <div class="sub">direct requests run at L${s.executionLevel} — Grover-initiated work needs approval</div></div>
      <div class="stat"><label>Today</label><div class="v">$${s.spend.today.toFixed(2)}</div>
        <div class="sub">cap $${s.spend.dailyCap}</div></div>
      <div class="stat"><label>Active loop</label>
        <div class="v" style="font-size:15px;line-height:1.3">${s.activeLoop
          ? `#${s.activeLoop.id} · ${esc(s.activeLoop.status)}`
          : '<span class="faint">none</span>'}</div>
        <div class="sub">${s.activeLoop ? esc(s.activeLoop.goal.slice(0, 60)) : 'type a request to start one'}</div></div>
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
  verifying: [['done', '✓ Done', 'ok', 'Close the loop — requires evidence'],
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
  const stopBtn = l.status === 'running'
    ? `<button class="danger" data-stop="${l.id}" title="Abort the runner — the loop blocks as 'stopped by user'">■ Stop</button>` : '';
  const ev = l.execution_evidence;
  return `
    <div class="card" draggable="true" data-drag-item="${l.ledger_id}"
      ${featured ? 'style="border-color:color-mix(in srgb, var(--accent) 40%, var(--border))"' : ''}>
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div style="min-width:0">
          <b>#${l.id} · ${esc(l.goal)}</b>
          <div class="small faint" style="margin-top:4px">
            <span class="badge ${STATUS_BADGE[l.status] || ''}">${esc(l.status)}</span>
            <span class="badge" style="color:${RISK_COLOR[l.risk]}">${esc(l.risk)} risk</span>
            ${l.source === 'improvement' ? '<span class="badge">improvement request</span>' : ''}
            ${l.source === 'direct' ? '<span class="badge">direct · path 1</span>' : ''}
            ${ev ? `<span class="badge b-approved">${ev.manual ? 'manual evidence' : `evidence · ${(ev.files || []).length} file(s)`}</span>` : ''}
            ${l.offline ? '<span class="badge">offline proposal</span>' : ''}
            ${l.effort_hours != null ? `<span class="badge">~${l.effort_hours}h</span>` : ''}
            ${l.cost_estimate ? `<span class="badge">${esc(l.cost_estimate)}</span>` : ''}
            · ledger #${l.ledger_id}
          </div>
          ${l.status === 'blocked' && l.blocked_reason
            ? `<div class="small" style="margin-top:6px;color:var(--state-err)">⛔ ${esc(l.blocked_reason)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          ${stopBtn}
          ${actions}
          <button class="ghost" data-open="${l.ledger_id}" title="Open the source item's brief, workshop, and evidence">Workshop ↗</button>
          <button class="danger" data-loop="${l.id}" data-st="killed" title="Kill this loop" aria-label="Kill loop">✕</button>
        </div>
      </div>
      ${l.status === 'verifying' && l.verify_plan.length ? `
        <div class="small" style="margin-top:8px">
          <b>Verification checklist</b> — all must hold before ✓ Done:
          <ul style="margin:4px 0 0;padding-left:18px">${l.verify_plan.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
        </div>` : ''}
      ${l.status === 'running' ? `
        <div class="small" style="margin-top:8px" data-progress="${l.id}">
          <div class="small faint">runner starting…</div>
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
      <p class="dim small">A loop is a tracked, auditable unit of Grover's self-development. Two ways in:
      hit <b>▶ Request &amp; execute</b> above and describe what you want — typed requests run immediately
      through the runner (Path 1) — or ✓ Greenlight a pending item below to queue a proposal-approved loop
      (Path 2, how Grover-initiated work gets in). Completion is evidence-gated either way.</p></div>`;
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
              ${l.execution_evidence ? `<span class="badge b-approved">${l.execution_evidence.manual ? 'manual evidence' : 'evidence'}</span>` : ''}
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

  // Live progress on whichever loop is actually running — survives closing
  // the creation modal or reloading the page, since it reads real server
  // history rather than a one-time stream.
  const runningNow = active.find((l) => l.status === 'running');
  if (runningNow) startProgressPoll(el, runningNow.id);
  else stopProgressPoll();

  // Loop cards are draggable — drop one on a chat pane to discuss its item.
  el.querySelectorAll('[data-drag-item]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-grover-item', card.dataset.dragItem);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  // ■ Stop — aborts the runner; the loop blocks as 'stopped by user'.
  el.querySelectorAll('button[data-stop]').forEach((b) => {
    b.onclick = async () => {
      try {
        const r = await api(`/api/loops/${b.dataset.stop}/stop`, { method: 'POST', body: {} });
        toast(r.wasRunning
          ? `Stop requested — loop #${b.dataset.stop} will block at its next checkpoint.`
          : 'No runner is active on that loop (status is stale or it was started outside the runner).');
        if (!r.wasRunning) onChange?.();
      } catch (err) { toast(err.message, 'err'); }
    };
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
              : e.event === 'exec' ? '<span class="mono">exec</span>'
              : `${esc(e.from_status || '·')} → <b>${esc(e.to_status)}</b>`}</span>
            <span class="faint">${e.actor ? esc(e.actor) : ''}${e.note ? ` — ${esc(e.note)}` : ''}</span>
          </div>`).join('')
          : 'No events recorded (loop predates event tracking).';
      } catch { body.textContent = 'Could not load history.'; }
    });
  });

  el.querySelectorAll('button[data-loop]').forEach((b) => {
    b.onclick = async () => {
      let summary, reason, manualEvidence;
      if (b.dataset.st === 'killed') {
        summary = await promptModal('Kill this loop', 'One line: why is it being killed?', 'superseded / not worth it / …');
        if (summary === null) return;
      }
      if (b.dataset.st === 'blocked') {
        reason = await promptModal('Block this loop', 'What is in the way? (shown until unblocked)', 'waiting on API key / needs a decision on X / …');
        if (reason === null || !reason) return;
      }
      if (b.dataset.st === 'done') {
        const l = loops.find((x) => x.id === Number(b.dataset.loop));
        if (l?.execution_evidence) {
          summary = (await promptModal('Close the loop', 'One line: what changed, and what remains? (stored as the loop summary)', 'shipped X, verified by Y; Z left for later')) || undefined;
        } else {
          const att = await promptModal(
            'Close the loop — evidence required',
            'No runner evidence on this loop. Attest what was actually done and how it was verified (stored as manual evidence + summary).',
            'edited X by hand, ran verify, exercised the flow in the browser'
          );
          if (att === null || !att) { toast('Done requires evidence — nothing recorded.', 'err'); return; }
          summary = att;
          manualEvidence = att;
        }
      }
      try {
        await api(`/api/loops/${b.dataset.loop}/status`, {
          method: 'POST', body: { status: b.dataset.st, summary, reason, manual_evidence: manualEvidence },
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

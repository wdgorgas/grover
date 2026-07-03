/**
 * Secondary views: Builder, Ledger, Memory Vault, Costs, Skills, Audit,
 * Settings, and Desk pages. Vanilla, no framework, no build step.
 */
import { api, esc, md, toast, modal, closeModal, fmt$, fmtDate } from './api.js';
import { typewrite, countUp, stagger } from './fx.js';
import { ChatPane } from './pane.js';
import { greenlightFlow, renderSystemStrip, renderLoopsPanel, deskStarters } from './loop-ui.js';

const $view = () => document.getElementById('view');

function header(kicker, title, sub) {
  return `
    <p class="view-kicker">${esc(kicker)}</p>
    <h1>${esc(title)}</h1>
    <p class="view-sub" data-sub="${esc(sub)}"></p>`;
}

function mountHeaderFx() {
  const sub = $view().querySelector('.view-sub');
  if (sub) typewrite(sub, sub.dataset.sub);
  $view().classList.remove('view-enter');
  void $view().offsetWidth; // restart animation
  $view().classList.add('view-enter');
}

// ============================== LEDGER ITEM (shared) ========================

const expanded = new Set();

function itemCard(it, { actions = true } = {}) {
  const isOpen = expanded.has(it.id);
  return `
    <div class="card expandable ${isOpen ? 'expanded' : ''}" data-item="${it.id}">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div style="min-width:0">
          <div style="font-weight:550">${esc(it.item)}</div>
          <div class="small faint" style="margin-top:5px">
            <span class="badge">${esc(it.domain)}</span>
            <span class="badge">${esc(it.category)}</span>
            <span class="badge b-${esc(it.severity)}">${esc(it.severity)}</span>
            <span class="badge b-${esc(it.status)}">${esc(it.status.replace(/_/g, ' '))}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          ${actions ? statusButtons(it) : ''}
        </div>
      </div>
      ${isOpen ? `<div class="item-detail" data-detail="${it.id}"></div>` : ''}
    </div>`;
}

function statusButtons(it) {
  const btn = (act, label, cls, title) => `<button class="${cls}" data-status="${act}" data-id="${it.id}" title="${title}">${label}</button>`;
  if (it.status === 'pending_greenlight') {
    return btn('approved', '✓ Greenlight', 'ok', 'Approve — records the greenlight; nothing runs automatically')
      + btn('deferred', '⏸', 'ghost', 'Defer')
      + btn('rejected', '✕', 'danger', 'Reject');
  }
  if (it.status === 'approved') return btn('done', '✓ Done', 'ok', 'Mark completed') + btn('deferred', '⏸', 'ghost', 'Defer');
  if (it.status === 'deferred') return btn('pending_greenlight', '↺ Revive', 'ghost', 'Back to pending');
  return '';
}

function bindItemCards(container, rerender, state) {
  container.querySelectorAll('button[data-status]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      // Greenlight runs the Build Loop flow: proposal → approval → tracked loop.
      if (b.dataset.status === 'approved') {
        greenlightFlow(Number(b.dataset.id), rerender);
        return;
      }
      try {
        await api(`/api/ledger/${b.dataset.id}/status`, { method: 'POST', body: { status: b.dataset.status } });
        toast(`Marked ${b.dataset.status.replace(/_/g, ' ')}.`, 'ok');
        rerender();
      } catch (err) { toast(err.message, 'err'); }
    };
  });
  container.querySelectorAll('.card[data-item]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, input, textarea, select, a, .item-detail')) return;
      const id = Number(card.dataset.item);
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      rerender();
    });
  });
  container.querySelectorAll('[data-detail]').forEach((el) => mountItemDetail(el, Number(el.dataset.detail), rerender, state));
}

async function mountItemDetail(el, id, rerender, state) {
  const items = await api('/api/ledger');
  const it = items.find((x) => x.id === id);
  if (!it) { el.innerHTML = '<span class="dim small">Item not found.</span>'; return; }

  el.innerHTML = `
    <div class="facts">
      <span>#${it.id}</span>
      <span>by ${esc(it.detected_by)}</span>
      <span>${fmtDate(it.created_at)}</span>
      ${it.greenlighter ? `<span>greenlit by ${esc(it.greenlighter)}</span>` : ''}
      ${it.cost_estimate ? `<span>~${esc(it.cost_estimate)}</span>` : ''}
    </div>
    ${it.notes ? `<div class="small dim" style="margin-bottom:8px">${esc(it.notes)}</div>` : ''}
    <div data-brief-zone>
      ${it.brief
        ? `<div class="brief-box">${md(it.brief)}</div>
           <button class="ghost" data-act="rebrief">↻ Regenerate brief</button>`
        : `<button class="primary" data-act="brief">Generate implementation brief</button>
           <span class="small faint" style="margin-left:8px">Grover writes the plan: steps, effort, risks, definition of done.</span>`}
    </div>
    <div class="workshop">
      <h3 style="margin:14px 0 8px">Workshop</h3>
      <div class="chat-log" data-ws-log></div>
      <div class="composer">
        <div class="composer-row">
          <textarea class="chat-input" data-ws-input rows="1" placeholder="Talk this item through with Grover…"></textarea>
          <button class="send-btn" data-ws-send>▶</button>
        </div>
      </div>
      <div class="workshop-hint">Greenlighting records approval — nothing executes on its own. This thread is for
      scoping, planning, and refining the item${it.domain === 'grover-dev' ? ' (Grover Architect is on the line)' : ''}.</div>
    </div>`;

  const briefZone = el.querySelector('[data-brief-zone]');
  const genBrief = async (btn) => {
    btn.disabled = true;
    btn.textContent = 'Grover is planning…';
    try {
      const r = await api(`/api/ledger/${id}/brief`, { method: 'POST' });
      briefZone.innerHTML = `<div class="brief-box view-enter">${md(r.brief)}</div>
        <button class="ghost" data-act="rebrief">↻ Regenerate brief</button>
        <span class="small faint" style="margin-left:8px">cost $${r.cost.toFixed(4)}</span>`;
      briefZone.querySelector('[data-act=rebrief]').onclick = (e) => genBrief(e.target);
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
      btn.textContent = 'Generate implementation brief';
    }
  };
  briefZone.querySelector('[data-act=brief]')?.addEventListener('click', (e) => genBrief(e.target));
  briefZone.querySelector('[data-act=rebrief]')?.addEventListener('click', (e) => genBrief(e.target));

  const pane = new ChatPane({
    log: el.querySelector('[data-ws-log]'),
    input: el.querySelector('[data-ws-input]'),
    sendBtn: el.querySelector('[data-ws-send]'),
    endpoint: `/api/ledger/${id}/chat`,
    buildBody: (message, override) => ({ message, force: override?.force }),
    onConversation: () => {},
  });
  try {
    const history = await api(`/api/ledger/${id}/messages`);
    if (history.length) pane.loadHistory(history);
  } catch { /* fresh thread */ }
}

// ============================== BUILDER =====================================

export async function renderBuilder(state) {
  const items = await api('/api/ledger?domain=grover-dev');
  const groups = { pending_greenlight: [], approved: [], deferred: [], done: [], rejected: [] };
  for (const it of items) (groups[it.status] || groups.deferred).push(it);
  const historyItems = [...groups.done, ...groups.rejected];

  $view().innerHTML = `
    ${header('domain: grover-dev', 'Builder', 'Grover builds Grover. Greenlighting records a decision — the work itself happens when you act on it, or when a future coding loop is pointed at it.')}
    <div class="callout reveal">
      <b>How this works:</b> ✓ Greenlight → Grover drafts a build proposal (scope, plan, risk, effort) →
      you approve → it becomes a tracked loop below. Nothing executes automatically at autonomy L1 —
      the loop is the plan-of-record you (or a supervised session) work from.
    </div>
    <div id="sys-strip"></div>
    <div id="loops-panel"></div>
    <div class="toolbar">
      <button class="primary" id="quick-add">＋ Log work item</button>
      <span class="spacer"></span>
      <span class="dim small">${groups.pending_greenlight.length} pending · ${groups.approved.length} queued · ${historyItems.length} closed</span>
    </div>
    ${section('Awaiting greenlight', groups.pending_greenlight)}
    ${section('Build queue — approved', groups.approved)}
    ${section('Deferred', groups.deferred)}
    ${historyItems.length ? `
      <details class="history">
        <summary>History — ${historyItems.length} closed item${historyItems.length === 1 ? '' : 's'}</summary>
        ${historyItems.map((it) => itemCard(it, { actions: false })).join('')}
      </details>` : ''}
  `;
  mountHeaderFx();
  stagger($view(), ':scope > .card, :scope > h2');
  renderSystemStrip($view().querySelector('#sys-strip'));
  renderLoopsPanel($view().querySelector('#loops-panel'), () => renderBuilder(state), (ledgerId) => {
    expanded.add(ledgerId);
    renderBuilder(state);
  });
  $view().querySelector('#quick-add').onclick = () => ledgerForm({ domain: 'grover-dev' }, () => renderBuilder(state));
  bindItemCards($view(), () => renderBuilder(state), state);

  function section(title, rows) {
    if (!rows.length) return '';
    return `<h2>${title}</h2>` + rows.map((it) => itemCard(it)).join('');
  }
}

// ============================== LEDGER ======================================

export async function renderLedger(state, filters = {}) {
  const params = new URLSearchParams();
  if (filters.domain) params.set('domain', filters.domain);
  if (filters.status) params.set('status', filters.status);
  const items = await api(`/api/ledger?${params}`);
  const active = items.filter((i) => !['done', 'rejected'].includes(i.status));
  const closed = items.filter((i) => ['done', 'rejected'].includes(i.status));
  const showClosedInline = Boolean(filters.status);

  $view().innerHTML = `
    ${header('deferred action ledger', 'Ledger', 'Everything worth doing eventually — repairs, upgrades, follow-ups, decisions — held here until greenlit, so nothing gets lost in chat history.')}
    <div class="toolbar">
      <select id="f-domain">
        <option value="">All domains</option>
        ${state.ledgerDomains.map((d) => `<option ${filters.domain === d ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
      <select id="f-status">
        <option value="">All statuses</option>
        ${state.ledgerStatuses.map((s) => `<option ${filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <span class="spacer"></span>
      <button class="primary" id="add-item">＋ New entry</button>
    </div>
    ${(showClosedInline ? items : active).map((it) => itemCard(it)).join('')}
    ${!showClosedInline && closed.length ? `
      <details class="history">
        <summary>History — ${closed.length} closed item${closed.length === 1 ? '' : 's'}</summary>
        ${closed.map((it) => itemCard(it, { actions: false })).join('')}
      </details>` : ''}
    ${items.length === 0 ? '<p class="dim">Nothing here. Either impressive discipline or an empty filter.</p>' : ''}
  `;
  mountHeaderFx();
  stagger($view(), ':scope > .card');
  const rerender = () => renderLedger(state, {
    domain: $view().querySelector('#f-domain').value || undefined,
    status: $view().querySelector('#f-status').value || undefined,
  });
  $view().querySelector('#f-domain').onchange = rerender;
  $view().querySelector('#f-status').onchange = rerender;
  $view().querySelector('#add-item').onclick = () => ledgerForm({}, rerender);
  bindItemCards($view(), rerender, state);
}

function ledgerForm(preset, done) {
  const domains = ['grover-dev', 'home-tech', 'health', 'business', 'research', 'personal-goal'];
  const cats = ['repair', 'upgrade', 'follow-up', 'decision', 'opportunity', 'bug', 'feature'];
  const m = modal(`
    <h2>New ledger entry</h2>
    <label class="f">Item</label>
    <input type="text" id="l-item" style="width:100%" placeholder="What needs doing eventually?">
    <label class="f">Domain</label>
    <select id="l-domain" style="width:100%">${domains.map((d) => `<option ${preset.domain === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <label class="f">Category</label>
    <select id="l-cat" style="width:100%">${cats.map((c) => `<option>${c}</option>`).join('')}</select>
    <label class="f">Severity</label>
    <select id="l-sev" style="width:100%"><option>low</option><option selected>medium</option><option>high</option><option>urgent</option></select>
    <label class="f">Notes (optional)</label>
    <textarea class="field" id="l-notes" rows="3" style="width:100%"></textarea>
    <div class="row">
      <button class="ghost" id="l-cancel">Cancel</button>
      <button class="primary" id="l-save">Log it</button>
    </div>`);
  m.querySelector('#l-cancel').onclick = closeModal;
  m.querySelector('#l-save').onclick = async () => {
    const item = m.querySelector('#l-item').value.trim();
    if (!item) return;
    try {
      await api('/api/ledger', { method: 'POST', body: {
        item,
        domain: m.querySelector('#l-domain').value,
        category: m.querySelector('#l-cat').value,
        severity: m.querySelector('#l-sev').value,
        notes: m.querySelector('#l-notes').value.trim() || undefined,
      }});
      closeModal(); toast('Logged.', 'ok'); done();
    } catch (err) { toast(err.message, 'err'); }
  };
  m.querySelector('#l-item').focus();
}

// ============================== DESK ========================================

export async function renderDesk(state, skillId) {
  const skills = await api('/api/skills');
  const skill = skills.find((s) => s.id === Number(skillId) && s.kind === 'domain');
  if (!skill) { $view().innerHTML = '<p class="dim">Unknown desk.</p>'; return; }
  const accent = skill.accent || 'var(--accent)';
  const deskName = skill.name.replace(/ Desk$/, '');

  $view().innerHTML = `
    <div class="desk-page" style="--desk-accent:${esc(accent)}; height:calc(100vh - 0px); margin:-34px -38px -70px; padding:0 14px; position:relative">
      <div class="desk-wash"></div>
      <div class="desk-head">
        <p class="view-kicker">desk</p>
        <h1>${esc(deskName)}</h1>
        <p class="view-sub" data-sub="${esc(skill.purpose)}"></p>
      </div>
      <div class="chat-log" data-desk-log style="max-width:780px"></div>
      <div class="composer">
        <div class="composer-toolbar">
          <select class="pill-select" data-desk-tier title="Model tier">
            <option value="">Auto</option>
            <option value="fast">Fast</option>
            <option value="smart">Smart</option>
            <option value="frontier">Frontier</option>
            <option value="fable">Fable</option>
          </select>
          <button class="ghost" data-desk-new>＋ New thread</button>
        </div>
        <div class="composer-row">
          <textarea class="chat-input" data-desk-input rows="1" placeholder="Work with the ${esc(deskName)} desk…"></textarea>
          <button class="send-btn" data-desk-send>▶</button>
        </div>
      </div>
    </div>`;
  const sub = $view().querySelector('.view-sub');
  typewrite(sub, sub.dataset.sub);

  const lsKey = `grover.desk.${skill.id}.${state.user.id}`;
  let conversationId = Number(localStorage.getItem(lsKey)) || null;

  const pane = new ChatPane({
    log: $view().querySelector('[data-desk-log]'),
    input: $view().querySelector('[data-desk-input]'),
    sendBtn: $view().querySelector('[data-desk-send]'),
    endpoint: '/api/chat',
    buildBody: (message, override) => ({
      conversationId,
      message,
      skillId: skill.id,
      tier: $view().querySelector('[data-desk-tier]').value || undefined,
      force: override?.force,
    }),
    onConversation: (id) => { conversationId = id; localStorage.setItem(lsKey, id); },
  });

  $view().querySelector('[data-desk-new]').onclick = () => {
    conversationId = null;
    localStorage.removeItem(lsKey);
    pane.o.log.innerHTML = '';
    pane.addCard(`<h4>${esc(deskName)} desk — fresh thread.</h4><div class="dim small">${esc(skill.purpose)}</div>`);
  };

  if (conversationId) {
    try {
      const msgs = await api(`/api/conversations/${conversationId}/messages`);
      pane.loadHistory(msgs);
    } catch {
      conversationId = null;
      localStorage.removeItem(lsKey);
    }
  }
  if (!pane.o.log.childElementCount) {
    pane.addCard(`<h4>${esc(deskName)} desk.</h4>
      <div class="dim small">${esc(skill.purpose)}</div>
      <div class="small" style="margin-top:8px">
        <span class="badge">status: new thread</span>
        <span class="badge">expertise: loaded</span>
        <span class="badge">memory: your namespaces</span>
      </div>
      <div class="faint small" style="margin-top:8px">Today this desk is expert conversation with its own thread.
      Coming later: desk-specific dashboards and tools (experiments board here for Business, source maps for
      Research) — they'll be built through the Builder's greenlight loop, not promised silently.</div>`);
    pane.o.log.appendChild(deskStarters(deskName, pane.o.input));
  }
}

// ============================== MEMORY ======================================

export async function renderMemory(state, tab = 'memories') {
  $view().innerHTML = `
    ${header('memory system', 'Memory Vault', 'Structured memories drive retrieval; the Markdown vault is the human-readable surface — Obsidian-compatible, and yours even if Grover breaks.')}
    <div class="toolbar">
      <div class="seg">
        <button data-tab="memories" class="${tab === 'memories' ? 'on' : ''}">Memories</button>
        <button data-tab="vault" class="${tab === 'vault' ? 'on' : ''}">Vault files</button>
      </div>
    </div>
    <div id="mem-body"></div>`;
  mountHeaderFx();
  $view().querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => renderMemory(state, b.dataset.tab);
  });
  if (tab === 'memories') renderMemoriesTab(state);
  else renderVaultTab(state);
}

async function renderMemoriesTab(state, query = '') {
  const body = document.getElementById('mem-body');
  const rows = await api(`/api/memory${query ? `?query=${encodeURIComponent(query)}` : ''}`);
  body.innerHTML = `
    <div class="toolbar">
      <input type="text" id="mem-q" placeholder="Search memories…" value="${esc(query)}" style="width:280px">
      <span class="spacer"></span>
      <button class="primary" id="mem-add">＋ Remember something</button>
    </div>
    <div class="table-card"><table class="grid">
      <thead><tr><th>Memory</th><th>Namespace</th><th>Category</th><th>Conf</th><th>Imp</th><th></th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${esc(r.content)}</td>
            <td><span class="badge">${esc(r.namespace)}</span></td>
            <td class="small dim">${esc(r.category)}</td>
            <td class="small dim">${esc(r.confidence)}</td>
            <td class="small dim">${r.importance}</td>
            <td><button class="danger" data-del="${r.id}" title="Forget">✕</button></td>
          </tr>`).join('')}
      </tbody>
    </table></div>
    ${rows.length === 0 && !query ? `
      <div class="empty-state">
        <b>Nothing remembered yet.</b>
        <p class="dim small">Memories are durable facts, preferences, and decisions Grover injects into every
        relevant conversation. Two ways to create them: switch the Command Center to <b>Brain Dump</b> mode and
        think out loud (Grover proposes, you approve), or add one directly.</p>
        <button class="primary" id="mem-add-2">＋ Remember something now</button>
      </div>` : rows.length === 0 ? '<p class="dim">No matches for that search.</p>' : ''}`;

  let t;
  body.querySelector('#mem-q').oninput = (e) => {
    clearTimeout(t);
    t = setTimeout(() => renderMemoriesTab(state, e.target.value.trim()), 300);
  };
  body.querySelector('#mem-add').onclick = () => memoryForm(state, () => renderMemoriesTab(state, query));
  body.querySelector('#mem-add-2')?.addEventListener('click', () => memoryForm(state, () => renderMemoriesTab(state, query)));
  body.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      await api(`/api/memory/${b.dataset.del}`, { method: 'DELETE' });
      toast('Forgotten.', 'ok');
      renderMemoriesTab(state, query);
    };
  });
}

function memoryForm(state, done) {
  const m = modal(`
    <h2>Remember something</h2>
    <label class="f">The memory</label>
    <textarea class="field" id="m-content" rows="3" style="width:100%" placeholder="A durable fact, preference, goal, or decision…"></textarea>
    <label class="f">Namespace</label>
    <select id="m-ns" style="width:100%">
      ${state.namespaces.map((n) => `<option>${n}</option>`).join('')}
    </select>
    <label class="f">Category</label>
    <input type="text" id="m-cat" value="general" style="width:100%">
    <label class="f">Importance (1–5)</label>
    <input type="number" id="m-imp" min="1" max="5" value="3" style="width:100%">
    <div class="row">
      <button class="ghost" id="m-cancel">Cancel</button>
      <button class="primary" id="m-save">Save</button>
    </div>`);
  m.querySelector('#m-cancel').onclick = closeModal;
  m.querySelector('#m-save').onclick = async () => {
    const content = m.querySelector('#m-content').value.trim();
    if (!content) return;
    try {
      await api('/api/memory', { method: 'POST', body: {
        content,
        namespace: m.querySelector('#m-ns').value,
        category: m.querySelector('#m-cat').value.trim() || 'general',
        importance: Number(m.querySelector('#m-imp').value) || 3,
      }});
      closeModal(); toast('Remembered.', 'ok'); done();
    } catch (err) { toast(err.message, 'err'); }
  };
}

async function renderVaultTab(state) {
  const body = document.getElementById('mem-body');
  const tree = await api('/api/vault/tree');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:290px 1fr;gap:18px">
      <div id="vault-tree" style="max-height:65vh;overflow-y:auto">
        ${tree.map((f) => `<button class="ghost" data-path="${esc(f.path)}"
          style="display:block;width:100%;text-align:left;margin-bottom:4px;border-color:var(--border)">
          <span class="mono small">${esc(f.path)}</span></button>`).join('')}
      </div>
      <div>
        <div class="toolbar">
          <span id="vault-current" class="mono small dim">select a file</span>
          <span class="spacer"></span>
          <button class="primary" id="vault-save" disabled>Save</button>
        </div>
        <textarea class="field mono" id="vault-editor" rows="22" style="width:100%" disabled></textarea>
      </div>
    </div>`;
  const editor = body.querySelector('#vault-editor');
  const saveBtn = body.querySelector('#vault-save');
  const current = body.querySelector('#vault-current');
  let path = null;
  body.querySelectorAll('[data-path]').forEach((b) => {
    b.onclick = async () => {
      const f = await api(`/api/vault/file?path=${encodeURIComponent(b.dataset.path)}`);
      path = f.path;
      current.textContent = f.path;
      editor.value = f.content;
      editor.disabled = false;
      saveBtn.disabled = false;
    };
  });
  saveBtn.onclick = async () => {
    try {
      await api('/api/vault/file', { method: 'PUT', body: { path, content: editor.value } });
      toast('Vault file saved.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ============================== COSTS =======================================

export async function renderCosts() {
  const s = await api('/api/costs/summary');
  const calls = await api('/api/costs/calls');
  const cacheRate = s.totals.input_tokens + s.totals.cache_read > 0
    ? Math.round((s.totals.cache_read / (s.totals.input_tokens + s.totals.cache_read)) * 100) : 0;

  $view().innerHTML = `
    ${header('cost governor', 'Costs', 'Minimize cost per accepted useful outcome — not raw tokens. This dashboard is the truth; optimize the actual top spenders.')}
    <div class="cards-row">
      <div class="stat"><label>Today</label><div class="v" data-count="${s.spend.today}">$0</div><div class="sub">cap ${fmt$(s.budgets.dailyUsd)}</div></div>
      <div class="stat"><label>7 days</label><div class="v" data-count="${s.spend.week}">$0</div></div>
      <div class="stat"><label>This month</label><div class="v" data-count="${s.spend.month}">$0</div><div class="sub">cap ${fmt$(s.budgets.monthlyUsd)}</div></div>
      <div class="stat"><label>Cache read share</label><div class="v">${cacheRate}%</div><div class="sub">of input tokens</div></div>
      <div class="stat"><label>Failed-call cost</label><div class="v">${fmt$(s.totals.failed_cost)}</div></div>
    </div>
    <h2>Spend by model (this month)</h2>
    <div class="table-card"><table class="grid">
      <thead><tr><th>Model</th><th>Tier</th><th>Calls</th><th>In tokens</th><th>Out tokens</th><th>Cost</th></tr></thead>
      <tbody>${s.byModel.map((r) => `<tr>
        <td class="mono small">${esc(r.model)}</td><td><span class="badge">${esc(r.tier)}</span></td>
        <td>${r.calls}</td><td>${(r.input_tokens || 0).toLocaleString()}</td>
        <td>${(r.output_tokens || 0).toLocaleString()}</td><td class="mono">${fmt$(r.cost)}</td></tr>`).join('')}
      </tbody>
    </table></div>
    <h2>Spend by task type</h2>
    <div class="table-card"><table class="grid">
      <thead><tr><th>Task</th><th>Calls</th><th>Cost</th></tr></thead>
      <tbody>${s.byTask.map((r) => `<tr><td>${esc(r.task_type)}</td><td>${r.calls}</td><td class="mono">${fmt$(r.cost)}</td></tr>`).join('')}</tbody>
    </table></div>
    <h2>Recent calls</h2>
    <div class="table-card"><table class="grid">
      <thead><tr><th>When</th><th>User</th><th>Task</th><th>Tier</th><th>Tokens in/out</th><th>ms</th><th>Cost</th><th>Err</th></tr></thead>
      <tbody>${calls.slice(0, 40).map((c) => `<tr>
        <td class="small dim">${fmtDate(c.created_at)}</td><td class="small">${esc(c.user_name || '—')}</td>
        <td class="small">${esc(c.task_type)}</td><td><span class="badge">${esc(c.tier)}</span></td>
        <td class="mono small">${c.input_tokens}/${c.output_tokens}</td>
        <td class="small dim">${c.latency_ms ?? ''}</td>
        <td class="mono small">${fmt$(c.cost)}</td>
        <td class="small" style="color:var(--state-err)">${esc(c.error || '')}</td></tr>`).join('')}
      </tbody>
    </table></div>
    ${calls.length === 0 ? `
      <div class="empty-state">
        <b>No model calls yet.</b>
        <p class="dim small">Every conversation turn, memory extraction, title, proposal, and brief lands here
        with its real token counts and cost. Send Grover a message in the Command Center and this page starts
        earning its keep. Budgets live in Settings; the governor blocks overspend before it happens.</p>
      </div>` : ''}`;
  mountHeaderFx();
  stagger($view().querySelector('.cards-row'));
  $view().querySelectorAll('[data-count]').forEach((el) => {
    countUp(el, Number(el.dataset.count), (v) => fmt$(v));
  });
}

// ============================== SKILLS ======================================

export async function renderSkills(state) {
  const skills = await api('/api/skills');
  const desks = skills.filter((s) => s.kind === 'domain');
  const ops = skills.filter((s) => s.kind !== 'domain');

  const skillCard = (s, isDesk) => `
    <div class="card hover" data-id="${s.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="min-width:0">
          <b>${isDesk && s.accent ? `<span class="skill-accent-dot" style="background:${esc(s.accent)}"></span>` : ''}${esc(s.name)}</b>
          <span class="badge">${esc(s.risk_level)} risk</span>
          <div class="small dim" style="margin-top:3px">${esc(s.purpose)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          ${isDesk ? `<a href="#desk/${s.id}"><button class="ghost">Open desk →</button></a>` : ''}
          <button class="ghost" data-edit="${s.id}">Edit</button>
          <button class="${s.enabled ? 'ok' : 'ghost'}" data-toggle="${s.id}">${s.enabled ? 'Enabled' : 'Disabled'}</button>
        </div>
      </div>
      <details style="margin-top:8px"><summary class="small dim" style="cursor:pointer">Prompt</summary>
        <pre class="small" style="white-space:pre-wrap;background:var(--bg-2);padding:10px;border-radius:8px">${esc(s.prompt)}</pre>
      </details>
    </div>`;

  $view().innerHTML = `
    ${header('skill registry', 'Skills', 'Two kinds of expertise. Desks are workspaces you visit; background operators are applied by Grover automatically — you manage them, you don’t chat with them.')}
    <h2>Desks — your workspaces</h2>
    <p class="small dim" style="margin:-4px 0 14px">Each desk is a page in the sidebar with its own thread, accent, and expertise.</p>
    ${desks.map((s) => skillCard(s, true)).join('')}
    <h2>Background operators — Grover's staff</h2>
    <p class="small dim" style="margin:-4px 0 14px">Auto-applied where they belong: Memory Curator runs during Brain Dumps, Grover Architect joins grover-dev workshops, Code Review gates future coding loops, Token Efficiency audits spend. You will rarely talk to these directly — that is the point.</p>
    ${ops.map((s) => skillCard(s, false)).join('')}`;
  mountHeaderFx();
  stagger($view(), ':scope > .card');

  $view().querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      const s = skills.find((x) => x.id === Number(b.dataset.toggle));
      await api('/api/skills', { method: 'POST', body: { id: s.id, enabled: !s.enabled } });
      renderSkills(state);
    };
  });
  $view().querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => {
      const s = skills.find((x) => x.id === Number(b.dataset.edit));
      const m = modal(`
        <h2>Edit skill: ${esc(s.name)}</h2>
        <label class="f">Purpose</label>
        <input type="text" id="s-purpose" value="${esc(s.purpose)}" style="width:100%">
        <label class="f">Prompt</label>
        <textarea class="field mono" id="s-prompt" rows="14" style="width:100%">${esc(s.prompt)}</textarea>
        <div class="row">
          <button class="ghost" id="s-cancel">Cancel</button>
          <button class="primary" id="s-save">Save</button>
        </div>`);
      m.querySelector('#s-cancel').onclick = closeModal;
      m.querySelector('#s-save').onclick = async () => {
        await api('/api/skills', { method: 'POST', body: {
          id: s.id,
          purpose: m.querySelector('#s-purpose').value,
          prompt: m.querySelector('#s-prompt').value,
        }});
        closeModal(); toast('Skill saved.', 'ok'); renderSkills(state);
      };
    };
  });
}

// ============================== AUDIT =======================================

export async function renderAudit() {
  const rows = await api('/api/audit');
  $view().innerHTML = `
    ${header('accountability', 'Audit Log', 'Every consequential action, attributable and timestamped. Model calls live in Costs.')}
    <div class="table-card"><table class="grid">
      <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="small dim">${fmtDate(r.created_at)}</td>
        <td class="small">${esc(r.user_name || 'system')}</td>
        <td><span class="badge">${esc(r.action)}</span></td>
        <td class="small dim">${esc(r.detail || '')}</td></tr>`).join('')}
      </tbody>
    </table></div>
    ${rows.length === 0 ? `
      <div class="empty-state">
        <b>Nothing audited yet.</b>
        <p class="dim small">Every consequential action — greenlights, loop transitions, memory writes, settings
        changes, budget overrides — is recorded here with who did it and when. It fills up the moment you start
        using Grover; it can't be edited from the UI, by design.</p>
      </div>` : ''}`;
  mountHeaderFx();
}

// ============================== SETTINGS ====================================

export async function renderSettings(state, onThemeChange, onUserChange) {
  const themes = [
    { id: 'atelier', name: 'Atelier', kind: 'command center v2', dots: ['#7cc7bc', '#9a8cf2', '#eeb069'] },
    { id: 'default', name: 'Default', kind: 'signature neon', dots: ['#4cc9f0', '#7b2ff7', '#f72585'] },
    { id: 'arcane', name: 'Arcane', kind: 'painterly', dots: ['#3de8f0', '#b14aed', '#f2b34c'] },
    { id: 'pulse', name: 'Pulse', kind: 'electric', dots: ['#00e5ff', '#ff2d78', '#ffd166'] },
    { id: 'obsidian', name: 'Obsidian', kind: 'quiet luxury', dots: ['#d4a94f', '#8f8578', '#2a2620'] },
    { id: 'slate', name: 'Slate', kind: 'engineering', dots: ['#7fa6c9', '#c98d5f', '#2a3140'] },
    { id: 'porcelain', name: 'Porcelain', kind: 'editorial light', dots: ['#8c3041', '#34506b', '#a86b2d'] },
    { id: 'light', name: 'Light', kind: 'clean neon', dots: ['#0e86c4', '#6425d0', '#d61f74'] },
  ];
  const s = state.settings;
  $view().innerHTML = `
    ${header('configuration', 'Settings', 'Identity, keys, budgets, models, autonomy, and skin.')}

    <h2>Profile</h2>
    <div class="card">
      <div class="toolbar" style="margin:0">
        ${state.users.map((u) => `
          <button class="${u.id === state.user.id ? 'primary' : 'ghost'}" data-user="${u.id}">${esc(u.name)}</button>`).join('')}
        <span class="dim small">Private memory namespaces never cross profiles. Behind Cloudflare Access, identity comes from your login instead.</span>
      </div>
    </div>

    <h2>Anthropic API key</h2>
    <div class="card">
      <div class="small dim" style="margin-bottom:8px">
        ${state.hasApiKey ? `Configured: <span class="mono">${esc(state.maskedApiKey)}</span>.` : 'Not set — Grover can’t think without one.'}
        Stored locally in <code>data/secrets.json</code>, never committed.
      </div>
      <div style="display:flex;gap:8px">
        <input type="password" id="set-key" placeholder="sk-ant-…" style="flex:1">
        <button class="primary" id="save-key">${state.hasApiKey ? 'Replace' : 'Save'}</button>
        ${state.hasApiKey ? '<button class="danger" id="del-key">Remove</button>' : ''}
      </div>
    </div>

    <h2>Budgets (the Cost Governor enforces these)</h2>
    <div class="card">
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div><label class="f">Daily cap (USD)</label><input type="number" id="b-day" step="0.5" min="0" value="${s.budgets.dailyUsd}"></div>
        <div><label class="f">Monthly cap (USD)</label><input type="number" id="b-month" step="1" min="0" value="${s.budgets.monthlyUsd}"></div>
        <div><label class="f">Autonomy level (0–5)</label><input type="number" id="b-auto" min="0" max="5" value="${s.autonomyLevel}"></div>
      </div>
      <div class="small faint" style="margin-top:8px">Autonomy: 0 advise · 1 draft · 2 execute non-money · 3 tiny spends · 4 experiment budget · 5 capped autonomy. v1 kernel acts at ≤2 regardless; the setting gates future modules.</div>
      <div class="row" style="justify-content:flex-start"><button class="primary" id="save-budgets">Save budgets</button></div>
    </div>

    <h2>Model tiers</h2>
    <div class="card">
      <div class="small dim" style="margin-bottom:10px">Abstract capability tiers → concrete model IDs. Swap models under a tier without touching the router (§20). Pricing feeds the cost math — keep it current with docs.claude.com.</div>
      ${['fast', 'smart', 'frontier', 'fable'].map((t) => `
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
          <span class="badge" style="width:64px;text-align:center">${t}</span>
          <input type="text" id="model-${t}" value="${esc(s.models[t])}" style="width:230px" class="mono">
          <span class="small faint">$ in/out per MTok:</span>
          <input type="number" id="price-in-${t}" value="${s.pricing[t].in}" step="0.1" style="width:80px">
          <input type="number" id="price-out-${t}" value="${s.pricing[t].out}" step="0.5" style="width:80px">
        </div>`).join('')}
      <div class="row" style="justify-content:flex-start"><button class="primary" id="save-models">Save models</button></div>
    </div>

    <h2>Theme</h2>
    <div class="theme-row">
      ${themes.map((t) => `
        <div class="theme-opt ${(s.theme === t.id) ? 'on' : ''}" data-theme-id="${t.id}">
          <b class="small">${t.name}</b>
          <div class="dots">${t.dots.map((d) => `<i style="background:${d}"></i>`).join('')}</div>
          <div class="kind">${t.kind}</div>
        </div>`).join('')}
    </div>`;
  mountHeaderFx();

  $view().querySelectorAll('[data-user]').forEach((b) => {
    b.onclick = async () => {
      const r = await api('/api/user/select', { method: 'POST', body: { userId: Number(b.dataset.user) } });
      toast(`Switched to ${r.user.name}.`, 'ok');
      onUserChange();
    };
  });

  $view().querySelector('#save-key').onclick = async () => {
    const key = $view().querySelector('#set-key').value.trim();
    if (!key) return;
    try {
      const r = await api('/api/settings/key', { method: 'POST', body: { apiKey: key } });
      state.hasApiKey = r.hasApiKey; state.maskedApiKey = r.maskedApiKey;
      toast('Key saved.', 'ok'); renderSettings(state, onThemeChange, onUserChange);
    } catch (err) { toast(err.message, 'err'); }
  };
  $view().querySelector('#del-key')?.addEventListener('click', async () => {
    await api('/api/settings/key', { method: 'POST', body: { apiKey: '' } });
    state.hasApiKey = false; state.maskedApiKey = null;
    toast('Key removed.'); renderSettings(state, onThemeChange, onUserChange);
  });

  $view().querySelector('#save-budgets').onclick = async () => {
    const budgets = {
      dailyUsd: Number($view().querySelector('#b-day').value) || 0,
      monthlyUsd: Number($view().querySelector('#b-month').value) || 0,
    };
    const autonomyLevel = Math.min(5, Math.max(0, Number($view().querySelector('#b-auto').value) || 0));
    const r = await api('/api/settings', { method: 'PUT', body: { budgets, autonomyLevel } });
    state.settings = r.settings;
    document.getElementById('tele-autonomy').textContent = `L${autonomyLevel}`;
    toast('Budgets saved — governor updated.', 'ok');
  };

  $view().querySelector('#save-models').onclick = async () => {
    const models = {}, pricing = {};
    for (const t of ['fast', 'smart', 'frontier', 'fable']) {
      models[t] = $view().querySelector(`#model-${t}`).value.trim();
      pricing[t] = {
        in: Number($view().querySelector(`#price-in-${t}`).value) || 1,
        out: Number($view().querySelector(`#price-out-${t}`).value) || 5,
      };
    }
    const r = await api('/api/settings', { method: 'PUT', body: { models, pricing } });
    state.settings = r.settings;
    toast('Model tiers saved.', 'ok');
  };

  $view().querySelectorAll('[data-theme-id]').forEach((el) => {
    el.onclick = async () => {
      const theme = el.dataset.themeId;
      document.documentElement.dataset.theme = theme;
      const r = await api('/api/settings', { method: 'PUT', body: { theme } });
      state.settings = r.settings;
      onThemeChange();
      renderSettings(state, onThemeChange, onUserChange);
    };
  });
}

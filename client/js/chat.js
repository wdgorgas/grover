/**
 * Command Center chat: streaming turns, orb state choreography, brain-dump
 * approvals, budget gates, telemetry.
 *
 * Skills note: background operators (Memory Curator, Grover Architect, …)
 * are auto-applied server-side. Domain expertise lives on the Desk pages.
 */
import { api, streamTurn, esc, md, toast } from './api.js';

export class Chat {
  constructor({ orb, state }) {
    this.orb = orb;
    this.state = state;
    this.conversationId = null;
    this.mode = 'chat';
    this.busy = false;

    this.log = document.getElementById('chat-log');
    this.input = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('send-btn');
    this.tierSel = document.getElementById('tier-select');

    this.bind();
    this.refreshConversations();
    if (!state.hasApiKey) this.renderKeySetup();
    else this.renderGreeting();
  }

  bind() {
    this.sendBtn.onclick = () => this.send();
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    let listenTimer;
    this.input.addEventListener('input', () => {
      this.autosize();
      if (!this.busy && this.input.value.trim()) {
        this.orb.setState('listening');
        clearTimeout(listenTimer);
        listenTimer = setTimeout(() => { if (!this.busy) this.orb.setState('idle'); }, 2500);
      }
    });
    document.getElementById('mode-seg').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      this.mode = btn.dataset.mode;
      document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('on', b === btn));
      this.input.placeholder = this.mode === 'brain_dump'
        ? 'Brain dump — think out loud, Grover extracts the memories…'
        : 'Talk to Grover…';
    });
    document.getElementById('new-chat').onclick = () => this.newConversation();
  }

  autosize() {
    this.input.style.height = 'auto';
    this.input.style.height = Math.min(this.input.scrollHeight, 180) + 'px';
  }

  // ---- Rendering ------------------------------------------------------------

  addMsg(role, html) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.innerHTML = html;
    this.log.appendChild(el);
    this.scroll();
    return el;
  }

  addCard(html, kind = '') {
    const el = document.createElement('div');
    el.className = `sys-card ${kind}`;
    el.innerHTML = html;
    this.log.appendChild(el);
    this.scroll();
    return el;
  }

  scroll() { this.log.scrollTop = this.log.scrollHeight; }

  renderGreeting() {
    if (this.log.childElementCount) return;
    this.addCard(`<h4>GROVER online.</h4>
      <div class="dim small">Ready, ${esc(this.state.user.name)}. This is the general channel — the Desks in the
      sidebar carry their own expertise. Brain Dump mode extracts memories for your approval.
      Every turn is routed, costed, and budget-gated.</div>`);
  }

  renderKeySetup() {
    const card = this.addCard(`
      <h4>One thing before Grover can think: an Anthropic API key.</h4>
      <div class="dim small" style="margin-bottom:10px">
        Create one at <b>console.anthropic.com</b> → API keys. It's stored in
        <code>data/secrets.json</code> on this machine only — never in git, never leaves this box
        except to call the API itself.
      </div>
      <div style="display:flex;gap:8px">
        <input type="password" id="key-input" placeholder="sk-ant-…" style="flex:1">
        <button class="primary" id="key-save">Activate</button>
      </div>`, 'warn');
    card.querySelector('#key-save').onclick = async () => {
      const key = card.querySelector('#key-input').value.trim();
      if (!key) return;
      try {
        await api('/api/settings/key', { method: 'POST', body: { apiKey: key } });
        this.state.hasApiKey = true;
        card.remove();
        this.orb.setState('success');
        toast('API key saved — Grover is live.', 'ok');
        this.renderGreeting();
      } catch (err) { toast(err.message, 'err'); }
    };
    this.orb.setState('approval', 'needs api key');
  }

  // ---- Conversations ----------------------------------------------------------

  async refreshConversations() {
    try {
      const convs = await api('/api/conversations');
      const list = document.getElementById('conv-list');
      list.innerHTML = '';
      for (const c of convs.slice(0, 12)) {
        const b = document.createElement('button');
        b.textContent = c.title;
        b.title = `${c.messages} messages · ${c.updated_at}`;
        b.classList.toggle('on', c.id === this.conversationId);
        b.onclick = () => this.loadConversation(c.id);
        list.appendChild(b);
      }
    } catch { /* panel is decoration */ }
  }

  async loadConversation(id) {
    const msgs = await api(`/api/conversations/${id}/messages`);
    this.conversationId = id;
    this.log.innerHTML = '';
    for (const m of msgs) {
      if (m.role === 'user') this.addMsg('user', md(m.content));
      else this.addMsg('assistant', md(m.content) + this.metaLine(m));
    }
    this.refreshConversations();
  }

  metaLine(m) {
    if (!m.tier) return '';
    return `<div class="meta-line">${esc(m.tier)} · ${esc(m.model || '')}${m.cost != null ? ` · $${Number(m.cost).toFixed(4)}` : ''}</div>`;
  }

  newConversation() {
    this.conversationId = null;
    this.log.innerHTML = '';
    this.renderGreeting();
    this.refreshConversations();
  }

  // ---- The turn -----------------------------------------------------------------

  async send(forceBody = null) {
    if (this.busy) return;
    const message = forceBody ? forceBody.message : this.input.value.trim();
    if (!message) return;
    if (!this.state.hasApiKey) { this.renderKeySetup(); return; }

    this.busy = true;
    this.sendBtn.disabled = true;
    if (!forceBody) {
      this.addMsg('user', md(message));
      this.input.value = '';
      this.autosize();
    }

    const body = forceBody || {
      conversationId: this.conversationId,
      message,
      tier: this.tierSel.value || undefined,
      mode: this.mode,
    };

    let assistantEl = null;
    let assistantText = '';
    let meta = {};

    try {
      await streamTurn('/api/chat', body, (ev) => this.handleEvent(ev, {
        onDelta: (text) => {
          if (!assistantEl) assistantEl = this.addMsg('assistant', '');
          assistantText += text;
          assistantEl.innerHTML = md(assistantText);
          this.scroll();
        },
        onMeta: (m) => { meta = m; },
        onDone: (d) => {
          if (assistantEl) assistantEl.innerHTML = md(assistantText) + this.metaLine({
            tier: meta.tier, model: meta.model, cost: d.cost,
          });
        },
        resend: (b) => { this.busy = false; this.send(b); },
        message,
      }));
    } catch (err) {
      this.orb.setState('error', 'connection');
      this.addCard(`<h4>Turn failed.</h4><div class="dim small">${esc(err.message)}</div>`, 'error');
    }

    this.busy = false;
    this.sendBtn.disabled = false;
    this.refreshConversations();
    this.input.focus();
  }

  handleEvent(ev, h) {
    switch (ev.type) {
      case 'conversation':
        this.conversationId = ev.conversationId;
        break;
      case 'state':
        if (ev.state === 'retrieving_memory') this.orb.setState('memory');
        else if (ev.state === 'frontier') this.orb.setState('frontier');
        else if (ev.state === 'memory') this.orb.setState('memory', 'extracting');
        else this.orb.setState('thinking');
        break;
      case 'meta': {
        h.onMeta(ev);
        this.orb.setState(
          ev.tier === 'frontier' || ev.tier === 'fable' ? 'frontier' : 'thinking',
          `${ev.tier} · ${ev.model}`
        );
        setTele('tele-model', ev.model.replace('claude-', ''));
        setTele('tele-tier', ev.tier);
        const memEl = document.getElementById('tele-memories');
        memEl.innerHTML = ev.memoriesInjected?.length
          ? ev.memoriesInjected.map((m) => `<div>· ${esc(m.content)}</div>`).join('')
          : '<span class="faint">none relevant</span>';
        break;
      }
      case 'delta':
        h.onDelta(ev.text);
        break;
      case 'done':
        h.onDone(ev);
        this.orb.setState('success');
        setTele('tele-cost', `$${ev.cost.toFixed(4)}`);
        setTele('tele-latency', `${(ev.latencyMs / 1000).toFixed(1)}s`);
        setTele('tele-today', `$${ev.spentToday.toFixed(2)}`);
        break;
      case 'approval_required': {
        this.orb.setState('approval', ev.reason.replace('_', ' '));
        const card = this.addCard(`
          <h4>Budget gate: ${ev.reason === 'daily_cap' ? 'daily' : 'monthly'} cap would be exceeded.</h4>
          <div class="dim small">
            Spent today: $${ev.spentToday.toFixed(2)} / $${ev.caps.dailyUsd} ·
            month: $${ev.spentMonth.toFixed(2)} / $${ev.caps.monthlyUsd} ·
            this turn ≈ $${ev.estimatedCost.toFixed(4)}
          </div>
          <div class="row">
            <button class="ghost" data-act="cancel">Hold off</button>
            <button class="primary" data-act="force">Proceed anyway (audited)</button>
          </div>`, 'warn');
        card.querySelector('[data-act=cancel]').onclick = () => { card.remove(); this.orb.setState('idle'); };
        card.querySelector('[data-act=force]').onclick = () => {
          card.remove();
          h.resend({
            conversationId: this.conversationId,
            message: h.message,
            tier: this.tierSel.value || undefined,
            mode: this.mode,
            force: true,
          });
        };
        break;
      }
      case 'memory_candidates':
        this.renderMemoryCandidates(ev.candidates);
        break;
      case 'error':
        this.orb.setState('error', ev.code);
        if (ev.code === 'no_key' || ev.code === 'bad_key') {
          this.state.hasApiKey = false;
          this.renderKeySetup();
        } else {
          this.addCard(`<h4>Error (${esc(ev.code)})</h4><div class="dim small">${esc(ev.message)}</div>`, 'error');
        }
        break;
    }
  }

  renderMemoryCandidates(candidates) {
    const rows = candidates.map((c, i) => `
      <div class="mem-candidate">
        <input type="checkbox" checked data-i="${i}">
        <div class="body">${esc(c.content)}
          <div class="tags">${esc(c.namespace)} · ${esc(c.category)} · ${esc(c.confidence)} · imp ${esc(c.importance)}</div>
        </div>
      </div>`).join('');
    const card = this.addCard(`
      <h4>Memory candidates — approve what Grover should keep.</h4>
      ${rows}
      <div class="row">
        <button class="ghost" data-act="skip">Keep none</button>
        <button class="primary" data-act="save">Save selected</button>
      </div>`);
    card.querySelector('[data-act=skip]').onclick = () => card.remove();
    card.querySelector('[data-act=save]').onclick = async () => {
      const chosen = [...card.querySelectorAll('input:checked')].map((cb) => candidates[Number(cb.dataset.i)]);
      try {
        const res = await api('/api/memory/approve', { method: 'POST', body: { candidates: chosen } });
        toast(`${res.saved.length} memories saved.`, 'ok');
        this.orb.setState('success');
        card.remove();
      } catch (err) { toast(err.message, 'err'); }
    };
  }
}

function setTele(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

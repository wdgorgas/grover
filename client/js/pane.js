/**
 * ChatPane — a self-contained streaming chat unit used by Desk pages and
 * ledger workshops. The Command Center has its own richer wiring (chat.js);
 * both share streamTurn() from api.js.
 */
import { streamTurn, esc, md } from './api.js';

export class ChatPane {
  /**
   * opts: {
   *   log, input, sendBtn   — elements
   *   endpoint              — '/api/chat' or '/api/ledger/:id/chat'
   *   buildBody(message)    — returns request body (conversation handled by caller/server)
   *   onConversation(id)    — remember the conversation id
   *   onState(state)        — optional status hook ('thinking' | 'idle' | 'error')
   *   compact               — smaller meta lines
   * }
   */
  constructor(opts) {
    this.o = opts;
    this.busy = false;
    opts.sendBtn.onclick = () => this.send();
    opts.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    opts.input.addEventListener('input', () => this.autosize());
  }

  autosize() {
    const i = this.o.input;
    i.style.height = 'auto';
    i.style.height = Math.min(i.scrollHeight, 160) + 'px';
  }

  addMsg(role, html) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.innerHTML = html;
    this.o.log.appendChild(el);
    this.scroll();
    return el;
  }

  addCard(html, kind = '') {
    const el = document.createElement('div');
    el.className = `sys-card ${kind}`;
    el.innerHTML = html;
    this.o.log.appendChild(el);
    this.scroll();
    return el;
  }

  scroll() { this.o.log.scrollTop = this.o.log.scrollHeight; }

  loadHistory(messages) {
    this.o.log.innerHTML = '';
    for (const m of messages) {
      if (m.role === 'user') this.addMsg('user', md(m.content));
      else this.addMsg('assistant', md(m.content) + this.metaLine(m));
    }
  }

  metaLine(m) {
    if (!m.tier) return '';
    return `<div class="meta-line">${esc(m.tier)}${m.cost != null ? ` · $${Number(m.cost).toFixed(4)}` : ''}</div>`;
  }

  async send(overrideBody = null) {
    if (this.busy) return;
    const message = overrideBody ? overrideBody.message : this.o.input.value.trim();
    if (!message) return;
    this.busy = true;
    this.o.sendBtn.disabled = true;
    if (!overrideBody) {
      this.addMsg('user', md(message));
      this.o.input.value = '';
      this.autosize();
    }
    this.o.onState?.('thinking');

    let assistantEl = null;
    let text = '';
    let meta = {};
    try {
      await streamTurn(this.o.endpoint, this.o.buildBody(message, overrideBody), (ev) => {
        switch (ev.type) {
          case 'conversation': this.o.onConversation?.(ev.conversationId); break;
          case 'meta': meta = ev; break;
          case 'delta':
            if (!assistantEl) assistantEl = this.addMsg('assistant', '');
            text += ev.text;
            assistantEl.innerHTML = md(text);
            this.scroll();
            break;
          case 'done':
            if (assistantEl) assistantEl.innerHTML = md(text) + this.metaLine({ tier: meta.tier, cost: ev.cost });
            this.o.onState?.('idle');
            break;
          case 'approval_required': {
            const card = this.addCard(`
              <h4>Budget gate — ${ev.reason === 'daily_cap' ? 'daily' : 'monthly'} cap reached.</h4>
              <div class="dim small">This turn ≈ $${ev.estimatedCost.toFixed(4)}. Raise caps in Settings, or proceed once (audited).</div>
              <div class="row">
                <button class="ghost" data-a="no">Hold off</button>
                <button class="primary" data-a="go">Proceed anyway</button>
              </div>`, 'warn');
            card.querySelector('[data-a=no]').onclick = () => { card.remove(); this.o.onState?.('idle'); };
            card.querySelector('[data-a=go]').onclick = () => {
              card.remove();
              this.busy = false;
              this.send({ message, force: true });
            };
            break;
          }
          case 'error':
            this.o.onState?.('error');
            this.addCard(`<h4>Error (${esc(ev.code)})</h4><div class="dim small">${esc(ev.message)}</div>`, 'error');
            break;
        }
      });
    } catch (err) {
      this.o.onState?.('error');
      this.addCard(`<h4>Turn failed.</h4><div class="dim small">${esc(err.message)}</div>`, 'error');
    }
    this.busy = false;
    this.o.sendBtn.disabled = false;
    this.o.input.focus();
  }
}

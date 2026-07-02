/** Tiny API client + shared UI helpers. */

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
}

/** POST to an SSE endpoint and dispatch each event to onEvent. */
export async function streamTurn(endpoint, body, onEvent) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop();
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try { onEvent(JSON.parse(line.slice(5))); } catch { /* skip bad frame */ }
    }
  }
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Minimal markdown: code fences, inline code, bold. Safe (escapes first). */
export function md(text) {
  let s = esc(text);
  s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${code}</code></pre>`);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  return s;
}

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

let escHandler = null;

export function modal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.onclick = (e) => { if (e.target === root) closeModal(); };
  if (escHandler) document.removeEventListener('keydown', escHandler);
  escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escHandler);
  const m = root.querySelector('.modal');
  // Focus the first interactive element so keyboard users land inside.
  setTimeout(() => m.querySelector('input, textarea, select, button')?.focus(), 30);
  return m;
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
}

/** In-app replacement for window.prompt(): resolves string or null. */
export function promptModal(title, label, placeholder = '') {
  return new Promise((resolve) => {
    const m = modal(`
      <h2>${esc(title)}</h2>
      <label class="f">${esc(label)}</label>
      <input type="text" id="pm-input" style="width:100%" placeholder="${esc(placeholder)}">
      <div class="row">
        <button class="ghost" id="pm-cancel">Cancel</button>
        <button class="primary" id="pm-ok">Confirm</button>
      </div>`);
    const input = m.querySelector('#pm-input');
    const finish = (val) => { closeModal(); resolve(val); };
    m.querySelector('#pm-cancel').onclick = () => finish(null);
    m.querySelector('#pm-ok').onclick = () => finish(input.value.trim());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(input.value.trim()); });
  });
}

export const fmt$ = (n) => `$${(n ?? 0).toFixed(n >= 100 ? 0 : n >= 1 ? 2 : 4)}`;
export const fmtDate = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

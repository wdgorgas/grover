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

export function modal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal">${html}</div>`;
  root.onclick = (e) => { if (e.target === root) closeModal(); };
  return root.querySelector('.modal');
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export const fmt$ = (n) => `$${(n ?? 0).toFixed(n >= 100 ? 0 : n >= 1 ? 2 : 4)}`;
export const fmtDate = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

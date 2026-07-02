/**
 * GROVER app shell: boot, theming, navigation, desk routing.
 */
import { api } from './api.js';
import { GroverOrb } from './orb.js';
import { Chat } from './chat.js';
import {
  renderBuilder, renderLedger, renderMemory, renderCosts,
  renderSkills, renderAudit, renderSettings, renderDesk,
} from './views.js';

const state = {};
let orb, chat;

// v0.1 → v0.2 theme migration
const THEME_ALIASES = { spiderverse: 'pulse' };

async function boot() {
  const data = await api('/api/bootstrap');
  Object.assign(state, data);

  let theme = state.settings.theme || 'default';
  if (THEME_ALIASES[theme]) {
    theme = THEME_ALIASES[theme];
    api('/api/settings', { method: 'PUT', body: { theme } }).catch(() => {});
    state.settings.theme = theme;
  }
  document.documentElement.dataset.theme = theme;

  document.getElementById('user-name').textContent = state.user.name;
  document.getElementById('user-avatar').textContent = state.user.name[0];
  document.getElementById('tele-autonomy').textContent = `L${state.settings.autonomyLevel}`;

  orb = new GroverOrb(document.getElementById('orb'));
  chat = new Chat({ orb, state });

  await populateDesks();

  try {
    const costs = await api('/api/costs/summary');
    document.getElementById('tele-today').textContent = `$${costs.spend.today.toFixed(2)}`;
  } catch { /* non-fatal */ }

  refreshSystemMini();
  setInterval(refreshSystemMini, 60_000);

  window.addEventListener('hashchange', route);
  route();
}

/** Command Center "System" readout: active loop + next actions (/api/status). */
async function refreshSystemMini() {
  const el = document.getElementById('sys-mini');
  if (!el) return;
  try {
    const s = await api('/api/status');
    const loop = s.activeLoop
      ? `Loop #${s.activeLoop.id} <span class="badge">${s.activeLoop.status}</span><br>${escText(s.activeLoop.goal.slice(0, 70))}`
      : '<span class="faint">No active loop</span>';
    el.innerHTML = `${loop}<div style="margin-top:6px" class="faint">${s.nextActions.map(escText).join('<br>')}</div>`;
    // The orb is a presence: while idle it carries the active loop's state.
    orb?.setAmbient(s.activeLoop?.status || null);
  } catch { el.textContent = ''; }
}

function escText(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function populateDesks() {
  try {
    const skills = await api('/api/skills');
    state.skills = skills;
    const nav = document.getElementById('desk-nav');
    nav.innerHTML = '';
    for (const s of skills.filter((x) => x.kind === 'domain' && x.enabled)) {
      const a = document.createElement('a');
      a.href = `#desk/${s.id}`;
      a.dataset.view = `desk/${s.id}`;
      a.style.setProperty('--nav-accent', s.accent || 'var(--accent)');
      a.innerHTML = `<svg style="color:${s.accent || 'var(--accent)'}"><use href="#i-desk"/></svg> ${s.name.replace(/ Desk$/, '')}`;
      nav.appendChild(a);
    }
  } catch { /* desks are optional */ }
}

const VIEWS = {
  command: null, // special: always mounted
  builder: () => renderBuilder(state),
  ledger: () => renderLedger(state),
  memory: () => renderMemory(state),
  costs: () => renderCosts(),
  skills: () => renderSkills(state),
  audit: () => renderAudit(),
  settings: () => renderSettings(state, () => orb.refreshTheme(), onUserSwitch),
};

async function onUserSwitch() {
  const data = await api('/api/bootstrap');
  Object.assign(state, data);
  document.getElementById('user-name').textContent = state.user.name;
  document.getElementById('user-avatar').textContent = state.user.name[0];
  chat.newConversation();
  renderSettings(state, () => orb.refreshTheme(), onUserSwitch);
}

function route() {
  const hash = (location.hash || '#command').slice(1);
  const [name, arg] = hash.split('/');
  const isDesk = name === 'desk' && arg;
  const view = isDesk ? hash : (VIEWS[name] === undefined ? 'command' : name);

  document.querySelectorAll('#sidebar nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === view);
  });

  const cmd = document.getElementById('view-command');
  const gen = document.getElementById('view-generic');
  if (view === 'command') {
    cmd.hidden = false; gen.hidden = true;
    document.getElementById('chat-input')?.focus();
    return;
  }
  cmd.hidden = true; gen.hidden = false;
  document.getElementById('view').innerHTML = '<p class="dim">Loading…</p>';
  const render = isDesk ? () => renderDesk(state, arg) : VIEWS[name];
  Promise.resolve(render()).catch((err) => {
    document.getElementById('view').innerHTML = `<p style="color:var(--state-err)">Failed to load: ${err.message}</p>`;
  });
}

boot().catch((err) => {
  document.body.innerHTML = `<div style="padding:40px;font-family:monospace">
    GROVER failed to boot: ${err.message}<br><br>Is the server running? <code>node grover.mjs</code></div>`;
});

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

  typeSub('everything, routed');
  startClock();
  renderSkinChips(theme);
  renderStateChips();

  window.addEventListener('hashchange', route);
  route();
}

/** Context panel "Active task" + "Next actions" readout (/api/status). */
async function refreshSystemMini() {
  const taskEl = document.getElementById('ctx-task');
  const statusEl = document.getElementById('ctx-task-status');
  const queueEl = document.getElementById('ctx-queue');
  if (!taskEl) return;
  try {
    const s = await api('/api/status');
    if (s.activeLoop) {
      taskEl.textContent = s.activeLoop.goal.slice(0, 90);
      statusEl.textContent = `LOOP #${s.activeLoop.id} · ${s.activeLoop.status}`;
    } else {
      taskEl.textContent = 'No active task';
      statusEl.textContent = 'STANDING BY';
    }
    queueEl.innerHTML = s.nextActions.length
      ? s.nextActions.map(escText).join('<br>')
      : '<span class="faint">nothing queued</span>';
    // The orb is a presence: while idle it carries the active loop's state.
    orb?.setAmbient(s.activeLoop?.status || null);
  } catch { queueEl.textContent = ''; }
}

/** Desk subtitle typewrites once (UI_STYLE_GUIDE: subtitles typewrite). */
function typeSub(full) {
  const el = document.getElementById('desk-sub-text');
  const caret = document.getElementById('desk-sub-caret');
  if (!el) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = full;
    caret.classList.add('done');
    return;
  }
  let i = 0;
  const t = setInterval(() => {
    el.textContent = full.slice(0, ++i);
    if (i >= full.length) { clearInterval(t); caret.classList.add('done'); }
  }, 30);
}

/** Sidebar clock + context-panel uptime (since page load). */
function startClock() {
  const t0 = performance.now();
  const hh = (n) => String(n | 0).padStart(2, '0');
  const tick = () => {
    const d = new Date();
    const clock = document.getElementById('clock');
    if (clock) clock.textContent = `${hh(d.getHours())}:${hh(d.getMinutes())}`;
    const up = (performance.now() - t0) / 1000;
    const upEl = document.getElementById('ctx-uptime');
    if (upEl) upEl.textContent = `${hh(up / 3600)}:${hh((up % 3600) / 60)}:${hh(up % 60)}`;
  };
  tick();
  setInterval(tick, 1000);
}

/** Skin swatches (theme definition data, mirrors tokens.css palettes). */
const SKIN_SWATCHES = {
  default: 'linear-gradient(135deg,#4cc9f0,#7b2ff7 55%,#f72585)',
  atelier: 'linear-gradient(135deg,#7cc7bc,#9a8cf2 50%,#eeb069)',
  arcane: 'linear-gradient(135deg,#3de8f0,#b14aed 55%,#ffd27a)',
  pulse: 'linear-gradient(135deg,#00e5ff,#ff2d78 55%,#ffd166)',
  obsidian: 'linear-gradient(135deg,#7a6a4a,#d4a94f 60%,#f4e3b2)',
  slate: 'linear-gradient(135deg,#48708f,#c98d5f 60%,#ecd3a8)',
  porcelain: 'linear-gradient(135deg,#34506b,#8c3041 55%,#d9964a)',
  light: 'linear-gradient(135deg,#0e86c4,#6425d0 55%,#d61f74)',
};

function renderSkinChips(active) {
  const root = document.getElementById('skin-chips');
  if (!root) return;
  root.innerHTML = '';
  for (const [id, swatch] of Object.entries(SKIN_SWATCHES)) {
    const b = document.createElement('button');
    b.title = id[0].toUpperCase() + id.slice(1);
    b.style.background = swatch;
    b.classList.toggle('on', id === active);
    b.onclick = () => {
      document.documentElement.dataset.theme = id;
      state.settings.theme = id;
      api('/api/settings', { method: 'PUT', body: { theme: id } }).catch(() => {});
      orb.refreshTheme();
      renderSkinChips(id);
    };
    root.appendChild(b);
  }
}

/** Footer orb-state preview chips — click to audition a state. */
function renderStateChips() {
  const root = document.getElementById('state-chips');
  if (!root) return;
  const stateVar = {
    idle: '--state-idle', listening: '--state-idle', thinking: '--state-think',
    memory: '--state-think', tools: '--state-idle', agents: '--state-think',
    coding: '--state-create', frontier: '--state-frontier', approval: '--state-warn',
    error: '--state-err', success: '--state-ok',
  };
  root.innerHTML = '';
  for (const [id, v] of Object.entries(stateVar)) {
    const b = document.createElement('button');
    b.dataset.state = id;
    b.title = id;
    b.style.background = `var(${v})`;
    b.onclick = () => orb.setState(id, 'manual preview');
    root.appendChild(b);
  }
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

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let state = null;
let activeContext = null;
let activeConversationId = null;
let routeNotice = '';
const messageCache = new Map();
let memoryResults = [];
let memorySearchTimer = null;

function labelForContext(id) {
  if (id === 'general') return 'General';
  return state?.contexts?.find((context) => context.id === id)?.label ?? id;
}

function contextDescription(id) {
  if (id === 'general') return 'Everyday questions and conversations';
  return state?.contexts?.find((context) => context.id === id)?.description ?? '';
}

function activateView(name) {
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.utility-button').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  $$('.context-button').forEach((button) => button.classList.toggle('active', name === 'context' && button.dataset.context === activeContext));
}

function showUtility(name) {
  activeContext = null;
  activeConversationId = null;
  routeNotice = '';
  activateView(name);
  if (name === 'home') $('#home-request').focus();
}

function openContext(context, conversationId = null) {
  activeContext = context;
  const conversations = (state?.conversations ?? []).filter((item) => item.context === context);
  activeConversationId = conversationId ?? conversations[0]?.id ?? null;
  $('#context-eyebrow').textContent = context === 'general' ? 'Home conversation' : 'Workspace';
  $('#context-title').textContent = labelForContext(context);
  $('#context-description').textContent = contextDescription(context);
  $('#context-route-status').textContent = routeNotice;
  $('#context-request').placeholder = activeConversationId ? 'Continue this conversation…' : `Start something in ${labelForContext(context)}…`;
  activateView('context');
  if (context === 'general') $('.utility-button[data-view="home"]').classList.add('active');
  renderConversationWorkspace();
  if (activeConversationId) void hydrateConversation(activeConversationId).catch(() => {});
  $('#context-request').focus();
}

function mergeCachedMessages(messages) {
  const grouped = new Map();
  for (const message of messages ?? []) {
    grouped.set(message.conversation_id, [...(grouped.get(message.conversation_id) ?? []), message]);
  }
  for (const [conversationId, incoming] of grouped) {
    const merged = new Map((messageCache.get(conversationId) ?? []).map((message) => [message.id, message]));
    incoming.forEach((message) => merged.set(message.id, message));
    messageCache.set(conversationId, [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)));
  }
}

async function hydrateConversation(conversationId) {
  const conversation = (state?.conversations ?? []).find((item) => item.id === conversationId);
  const cached = messageCache.get(conversationId) ?? [];
  if (cached.length >= Number(conversation?.message_count ?? 0)) return;
  const messages = await window.grover.conversationMessages(conversationId);
  messageCache.set(conversationId, messages);
  if (activeConversationId === conversationId) renderConversationWorkspace();
}

function formatMoney(micro) {
  return `$${((Number(micro) || 0) / 1_000_000).toFixed(2)}`;
}

function parseActions(task) {
  try { return JSON.parse(task.actions || '[]'); }
  catch { return []; }
}

function taskCard(task) {
  const card = document.createElement('article');
  card.className = `task-card ${task.status}`;
  const head = document.createElement('div');
  head.className = 'task-head';
  const title = document.createElement('h3');
  title.textContent = task.plain_language;
  const status = document.createElement('span');
  status.className = 'task-status';
  status.textContent = task.status;
  head.append(title, status);
  card.append(head);
  const context = document.createElement('p');
  context.textContent = labelForContext(task.domain);
  card.append(context);
  const actions = parseActions(task);
  if (actions.length) {
    const area = document.createElement('div');
    area.className = 'task-actions';
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action[0].toUpperCase() + action.slice(1);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await window.grover.taskAction(task.task_id, action); }
        catch (error) { window.alert(error.message); }
        finally { button.disabled = false; }
      });
      area.append(button);
    }
    card.append(area);
  }
  return card;
}

function recoveryCardForTask(taskId) {
  const feature = (state.features ?? []).find((item) => item.task_id === taskId && item.recovery_state);
  if (!feature) return null;
  const saved = (state.recoveryCards ?? []).find((item) => item.build_run_id === feature.build_run_id);
  let recovery = {};
  try { recovery = JSON.parse(feature.recovery_state || '{}'); }
  catch { recovery = {}; }
  const changed = saved ? JSON.parse(saved.changed_files || '[]') : recovery.changedFiles ?? [];
  const evidence = saved ? JSON.parse(saved.evidence_collected || '[]') : recovery.evidenceCollected ?? [];
  const card = document.createElement('article');
  card.className = 'task-card failed recovery-card';
  const title = document.createElement('h3');
  title.textContent = 'Recovery details';
  const summary = document.createElement('p');
  summary.textContent = saved?.reason ?? recovery.reason ?? feature.failure_summary ?? 'The build stopped.';
  const files = document.createElement('p');
  files.textContent = `Changed files: ${changed.length ? changed.join(', ') : 'none recorded'} · ${saved?.revert_state ?? recovery.revertState ?? 'not inspected'}`;
  const proof = document.createElement('p');
  proof.textContent = `Evidence collected: ${evidence.length} · Cost: ${formatMoney(saved?.cost_spent ?? recovery.costSpent ?? 0)}`;
  const next = document.createElement('p');
  next.textContent = saved?.next_safe_action ?? recovery.nextAction ?? recovery.nextSafeAction ?? 'Review the failure before retrying.';
  card.append(title, summary, files, proof, next);
  return card;
}

function renderCurrentWork() {
  const container = $('#current-work');
  const active = (state.tasks ?? []).filter((task) => !['done', 'failed', 'cancelled'].includes(task.status));
  container.replaceChildren();
  if (!active.length) {
    container.className = 'task-list empty-state';
    container.textContent = 'Nothing running right now.';
    return;
  }
  container.className = 'task-list';
  active.slice(0, 6).forEach((task) => container.append(taskCard(task)));
}

function conversationButton(conversation) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'conversation-button';
  button.classList.toggle('active', conversation.id === activeConversationId);
  const title = document.createElement('strong');
  title.textContent = conversation.title;
  const meta = document.createElement('span');
  meta.textContent = `${labelForContext(conversation.context)} · ${new Date(conversation.updated_at).toLocaleString()}`;
  button.append(title, meta);
  button.addEventListener('click', () => {
    routeNotice = '';
    openContext(conversation.context, conversation.id);
  });
  return button;
}

function renderRecentConversations() {
  const container = $('#recent-conversations');
  container.replaceChildren();
  const conversations = state.conversations ?? [];
  if (!conversations.length) {
    container.className = 'conversation-list empty-state';
    container.textContent = 'No conversations yet.';
    return;
  }
  container.className = 'conversation-list';
  conversations.slice(0, 8).forEach((conversation) => container.append(conversationButton(conversation)));
}

function feedbackForTask(taskId) {
  const routing = (state.routing ?? []).find((item) => item.task_id === taskId);
  const area = document.createElement('div');
  area.className = 'message-feedback';
  if (routing?.rating) {
    area.textContent = routing.rating === 'positive' ? 'Marked useful' : 'Marked for improvement';
    return area;
  }
  area.append(document.createTextNode('Was this useful? '));
  for (const [rating, label] of [['positive', 'Yes'], ['negative', 'No']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', async () => {
      await window.grover.rateTask(taskId, rating);
      area.textContent = 'Feedback saved.';
    });
    area.append(button);
  }
  return area;
}

function renderConversationWorkspace() {
  if (!state || !activeContext) return;
  const projectArea = $('#coding-project');
  const project = (state.projects ?? []).find((item) => item.conversation_id === activeConversationId);
  projectArea.classList.toggle('is-hidden', activeContext !== 'coding');
  $('#coding-project-path').textContent = project?.root_path ?? 'Created automatically when Coding begins making files.';
  $('#choose-project-folder').disabled = activeContext !== 'coding' || !activeConversationId;
  $('#open-project-folder').disabled = !project;
  const mover = $('#move-conversation');
  mover.disabled = !activeConversationId;
  mover.value = activeContext;
  const list = $('#workspace-conversations');
  list.replaceChildren();
  const conversations = state.conversations.filter((item) => item.context === activeContext);
  if (!conversations.length) {
    const empty = document.createElement('p');
    empty.className = 'small-empty';
    empty.textContent = 'No conversations yet.';
    list.append(empty);
  } else {
    conversations.forEach((conversation) => list.append(conversationButton(conversation)));
  }

  const panel = $('#chat-messages');
  panel.replaceChildren();
  const messages = activeConversationId
    ? (messageCache.get(activeConversationId) ?? state.messages.filter((message) => message.conversation_id === activeConversationId))
    : [];
  if (!messages.length) {
    panel.className = 'chat-messages empty-state';
    panel.textContent = `Start a conversation in ${labelForContext(activeContext)}.`;
    return;
  }
  panel.className = 'chat-messages';
  for (const message of messages) {
    const bubble = document.createElement('article');
    bubble.className = `message ${message.role} ${message.state}`;
    const role = document.createElement('strong');
    role.textContent = message.role === 'user' ? 'You' : 'GROVER';
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = message.content;
    bubble.append(role, content);
    if (message.role === 'assistant' && message.task_id && message.state === 'complete') {
      bubble.append(feedbackForTask(message.task_id));
    }
    panel.append(bubble);
    if (message.role === 'assistant' && message.task_id && message.state === 'failed') {
      const recovery = recoveryCardForTask(message.task_id);
      if (recovery) panel.append(recovery);
    }
  }
  const taskIds = new Set(messages.map((message) => message.task_id).filter(Boolean));
  const running = state.tasks.find((task) => taskIds.has(task.task_id) && !['done', 'failed', 'cancelled'].includes(task.status));
  if (running) {
    const progress = document.createElement('article');
    progress.className = 'message assistant working';
    const role = document.createElement('strong');
    role.textContent = 'GROVER';
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = `${running.plain_language}…`;
    progress.append(role, content);
    panel.append(progress);
  }
  panel.scrollTop = panel.scrollHeight;
}

function renderContexts() {
  const nav = $('#context-navigation');
  nav.replaceChildren();
  for (const context of state.contexts ?? []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'context-button';
    button.dataset.context = context.id;
    button.textContent = context.label;
    button.title = context.description;
    button.addEventListener('click', () => {
      routeNotice = '';
      openContext(context.id);
    });
    nav.append(button);
  }
  const mover = $('#move-conversation');
  mover.replaceChildren();
  for (const context of [{ id: 'general', label: 'General' }, ...(state.contexts ?? [])]) {
    const option = document.createElement('option');
    option.value = context.id;
    option.textContent = context.label;
    mover.append(option);
  }
}

function renderEvents(events) {
  const container = $('#event-list');
  container.replaceChildren();
  for (const event of [...events].reverse().slice(0, 60)) {
    const row = document.createElement('div');
    row.className = 'event';
    const label = document.createElement('strong');
    label.textContent = `${event.phase} · `;
    row.append(label, document.createTextNode(event.plain_language));
    container.append(row);
  }
}

function renderMemories(memories) {
  const container = $('#memory-list');
  container.replaceChildren();
  $('#memory-result-count').textContent = $('#memory-search').value.trim()
    ? `${memories.length} matching memories`
    : `Showing ${memories.length} of ${state.memoryTotal ?? memories.length}`;
  if (!memories.length) {
    container.className = 'memory-list empty-state';
    container.textContent = 'No saved memories yet.';
    return;
  }
  container.className = 'memory-list';
  for (const memory of memories) {
    const card = document.createElement('article');
    card.className = 'memory-card';
    const text = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = memory.content;
    const meta = document.createElement('p');
    meta.textContent = `${memory.namespace} · ${new Date(memory.updated_at).toLocaleString()}`;
    text.append(strong, meta);
    const actions = document.createElement('div');
    actions.className = 'memory-actions';
    const correct = document.createElement('button');
    correct.type = 'button';
    correct.textContent = 'Correct';
    correct.addEventListener('click', async () => {
      const content = window.prompt('Replace this memory with the corrected fact:', memory.content);
      if (!content?.trim() || content.trim() === memory.content) return;
      await window.grover.correctMemory(memory.id, content.trim());
      if ($('#memory-search').value.trim()) {
        memoryResults = await window.grover.searchMemories($('#memory-search').value);
        renderMemories(memoryResults);
      }
    });
    const forget = document.createElement('button');
    forget.type = 'button';
    forget.textContent = 'Forget';
    forget.addEventListener('click', async () => {
      await window.grover.forget(memory.id);
      if ($('#memory-search').value.trim()) {
        memoryResults = await window.grover.searchMemories($('#memory-search').value);
        renderMemories(memoryResults);
      }
    });
    actions.append(correct, forget);
    card.append(text, actions);
    container.append(card);
  }
}

function renderMemoryProposals(proposals) {
  const container = $('#memory-proposals');
  container.replaceChildren();
  if (!proposals.length) {
    container.className = 'memory-list empty-state';
    container.textContent = 'No proposed memories.';
    return;
  }
  container.className = 'memory-list';
  for (const proposal of proposals) {
    const card = document.createElement('article');
    card.className = 'memory-card';
    const text = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = proposal.proposed_content;
    const meta = document.createElement('p');
    meta.textContent = `${proposal.sensitivity} · proposed from conversation · not saved yet`;
    text.append(strong, meta);
    const actions = document.createElement('div');
    actions.className = 'memory-actions';
    for (const [label, action] of [['Remember', 'approveMemory'], ['Ignore', 'rejectMemory']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => window.grover[action](proposal.id));
      actions.append(button);
    }
    card.append(text, actions);
    container.append(card);
  }
}

function engineName(id) {
  return state.engines?.find((engine) => engine.id === id)?.display_name ?? (id.startsWith('codex') ? 'Codex' : 'Claude');
}

function engineStateLabel(status) {
  if (status.state === 'ready') return 'Ready';
  if (status.state === 'sign-in-required') return 'Sign-in required';
  if (status.state === 'unavailable') return 'Not installed';
  if (status.state === 'error') return 'Needs attention';
  return 'Checking';
}

function renderEngines() {
  const statuses = state.runtime?.engineStatus ?? {};
  const entries = Object.entries(statuses);
  const ready = entries.filter(([, status]) => status.state === 'ready').map(([id]) => engineName(id));
  const needsSignIn = entries.filter(([, status]) => status.state === 'sign-in-required').map(([id]) => engineName(id));
  const problems = entries.filter(([, status]) => ['unavailable', 'error'].includes(status.state)).map(([id]) => engineName(id));
  const summary = [
    ready.length ? `${ready.join(' + ')} ready` : '',
    needsSignIn.length ? `${needsSignIn.join(' + ')} sign-in needed` : '',
    problems.length ? `${problems.join(' + ')} unavailable` : '',
  ].filter(Boolean).join(' · ') || 'Checking agents…';
  $('#engine-status').textContent = summary;
  $('#engine-status').classList.toggle('good', ready.length > 0);
  $('#engine-status').classList.toggle('attention', needsSignIn.length > 0 || problems.length > 0);

  const container = $('#engine-connections');
  container.replaceChildren();
  for (const [id, status] of entries) {
    const card = document.createElement('div');
    card.className = 'settings-card engine-card';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = engineName(id);
    const detail = document.createElement('p');
    detail.textContent = status.state === 'error' && status.lastError
      ? `${engineStateLabel(status)}. ${status.lastError}`
      : engineStateLabel(status);
    info.append(name, detail);
    card.append(info);
    if (status.installed) {
      const signIn = document.createElement('button');
      signIn.type = 'button';
      signIn.textContent = status.state === 'ready' ? 'Sign in again' : 'Sign in';
      signIn.addEventListener('click', async () => {
        signIn.disabled = true;
        try {
          await window.grover.signInEngine(id);
          detail.textContent = 'Sign-in opened. Finish it in the browser, then press Refresh.';
        } catch (error) { detail.textContent = error.message; }
        finally { signIn.disabled = false; }
      });
      card.append(signIn);
    }
    container.append(card);
  }
  const profiles = (state.modelProfiles ?? []).filter((profile) => profile.engine_id === 'codex-cli');
  const labels = ['fast', 'balanced', 'frontier'].map((tier) => {
    const profile = profiles.find((item) => item.model_tier === tier);
    return profile?.model_id
      ? `${tier}: ${profile.model_id}${profile.reasoning_effort ? ` (${profile.reasoning_effort})` : ''}`
      : `${tier}: provider default`;
  });
  $('#model-routing-profiles').textContent = `Local navigation and memory bypass agents · ${labels.join(' · ')}`;

  const manager = state.runtime?.managerStatus ?? { state: 'unavailable', detail: 'Local manager is not configured.' };
  const managerLabel = {
    ready: 'Shadow ready', starting: 'Starting', unavailable: 'Not prepared', error: 'Needs attention', stopped: 'Stopped',
  }[manager.state] ?? 'Checking';
  $('#manager-status').textContent = managerLabel;
  $('#manager-status').classList.toggle('good', manager.state === 'ready');
  $('#manager-status').classList.toggle('attention', ['unavailable', 'error'].includes(manager.state));
  $('#manager-detail').textContent = manager.state === 'ready' && manager.lastLatencyMs
    ? `${manager.detail} Last decision: ${(manager.lastLatencyMs / 1000).toFixed(2)} seconds.`
    : manager.detail;
}

function renderPolicies() {
  const container = $('#policy-rules');
  container.replaceChildren();
  for (const rule of state.policyRules ?? []) {
    const card = document.createElement('div');
    card.className = 'settings-card engine-card';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = rule.trigger_id.replaceAll('_', ' ');
    const detail = document.createElement('p');
    detail.textContent = rule.exact_scope;
    info.append(name, detail);
    const label = document.createElement('span');
    label.className = 'status-pill';
    label.textContent = rule.trigger_id === 'jackson_private' ? 'Always denied' : 'Narrow approval only';
    card.append(info, label);
    container.append(card);
  }
}

function render(next) {
  state = next;
  mergeCachedMessages(state.messages ?? []);
  if (!$('#memory-search').value.trim()) memoryResults = state.memories ?? [];
  renderContexts();
  renderEngines();
  renderPolicies();
  $('#cost-status').textContent = `${formatMoney(state.costs?.actual)} used`;
  $('#kill-switch').checked = Boolean(state.settings?.killSwitch);
  $('#workspace-path').textContent = state.runtime?.workspaceRoot ?? 'Not selected';
  $('#preferred-engine').value = state.settings?.preferredEngine ?? 'auto';
  renderCurrentWork();
  renderRecentConversations();
  renderEvents(state.events ?? []);
  renderMemories(memoryResults);
  renderMemoryProposals(state.memoryProposals ?? []);
  const backup = state.memoryBackup ?? {};
  $('#memory-backup-status').textContent = backup.reason ?? 'No verified backup yet.';
  $('#memory-backup-status').classList.toggle('good', Boolean(backup.green));
  renderConversationWorkspace();
}

async function submitPrompt(form, textarea, engineSelect) {
  const submit = form.querySelector('.submit-prompt');
  const error = form.querySelector('.composer-error');
  submit.disabled = true;
  error.textContent = '';
  try {
    const result = await window.grover.submit({
      text: textarea.value,
      context: form.id === 'context-composer' ? activeContext : undefined,
      conversationId: form.id === 'context-composer' ? activeConversationId : undefined,
      engine: engineSelect.value || undefined,
    });
    textarea.value = '';
    routeNotice = ['branched', 'reopened', 'navigated'].includes(result.conversationDisposition)
      ? result.routeReason
      : '';
    openContext(result.context, result.conversationId);
  } catch (failure) {
    error.textContent = failure.message;
  } finally {
    submit.disabled = false;
  }
}

$('#home-composer').addEventListener('submit', (event) => {
  event.preventDefault();
  void submitPrompt(event.currentTarget, $('#home-request'), $('#home-engine'));
});
$('#context-composer').addEventListener('submit', (event) => {
  event.preventDefault();
  void submitPrompt(event.currentTarget, $('#context-request'), $('#context-engine'));
});

$$('.prompt-input').forEach((textarea) => textarea.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    textarea.form.requestSubmit();
  }
}));

$$('.utility-button').forEach((button) => button.addEventListener('click', () => showUtility(button.dataset.view)));
$('#new-conversation').addEventListener('click', () => {
  activeConversationId = null;
  routeNotice = '';
  renderConversationWorkspace();
  $('#context-request').focus();
});
$('#move-conversation').addEventListener('change', async (event) => {
  if (!activeConversationId) return;
  const conversationId = activeConversationId;
  const context = event.target.value;
  event.target.disabled = true;
  try {
    await window.grover.moveConversation(conversationId, context);
    openContext(context, conversationId);
  } catch (error) {
    window.alert(error.message);
    event.target.value = activeContext;
  } finally {
    event.target.disabled = false;
  }
});
$('#choose-project-folder').addEventListener('click', async (event) => {
  if (!activeConversationId) return;
  event.currentTarget.disabled = true;
  try { await window.grover.chooseProjectFolder(activeConversationId); }
  catch (error) { window.alert(error.message); }
  finally { event.currentTarget.disabled = false; }
});
$('#open-project-folder').addEventListener('click', async (event) => {
  if (!activeConversationId) return;
  event.currentTarget.disabled = true;
  try { await window.grover.openProjectFolder(activeConversationId); }
  catch (error) { window.alert(error.message); }
  finally { event.currentTarget.disabled = false; }
});
$('#engine-status').addEventListener('click', () => showUtility('settings'));
$('#kill-switch').addEventListener('change', (event) => window.grover.setKillSwitch(event.target.checked));
$('#choose-workspace').addEventListener('click', () => window.grover.chooseWorkspace());
$('#preferred-engine').addEventListener('change', (event) => window.grover.setPreferredEngine(event.target.value));
$('#refresh-engines').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  try { await window.grover.refreshEngines(); }
  finally { event.currentTarget.disabled = false; }
});
$('#sync-memory').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const changed = await window.grover.syncMemory();
    button.textContent = changed ? `Synced ${changed}` : 'Vault is current';
  } finally {
    setTimeout(() => { button.textContent = 'Sync vault'; button.disabled = false; }, 1200);
  }
});
$('#export-memory').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await window.grover.exportMemory();
    if (result) window.alert(`Memory backup created in:\n${result.path}`);
  } finally { button.disabled = false; }
});
$('#restore-memory').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await window.grover.restoreMemory();
    if (result) window.alert(`Restored ${result.restored} memory records. A pre-restore backup was kept at:\n${result.preRestoreBackup}`);
  } catch (error) {
    window.alert(error.message);
  } finally { button.disabled = false; }
});
$('#memory-search').addEventListener('input', (event) => {
  clearTimeout(memorySearchTimer);
  const query = event.target.value;
  memorySearchTimer = setTimeout(async () => {
    memoryResults = await window.grover.searchMemories(query);
    renderMemories(memoryResults);
  }, 150);
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    showUtility('home');
  }
});

window.grover.onState(render);
window.grover.snapshot().then(render).catch((error) => {
  $('.composer-error').textContent = `GROVER could not start: ${error.message}`;
});

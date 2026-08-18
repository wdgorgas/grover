const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let state = null;

function showView(name) {
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
}

function formatMoney(micro) {
  return `$${((Number(micro) || 0) / 1_000_000).toFixed(2)}`;
}

function parseDetail(value) {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    if (parsed.request) return parsed.request;
    return JSON.stringify(parsed, null, 2);
  } catch { return value; }
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

  const detailText = parseDetail(task.internal_detail);
  if (detailText) {
    const detail = document.createElement('details');
    detail.className = 'detail';
    const summary = document.createElement('summary');
    summary.textContent = task.status === 'done' ? 'View result' : 'View details';
    const pre = document.createElement('pre');
    pre.textContent = detailText;
    detail.append(summary, pre);
    card.append(detail);
  }
  const actions = JSON.parse(task.actions || '[]');
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
  if (task.status === 'done' && ['ask', 'work', 'builder', 'build'].includes(task.domain)) {
    const feedback = document.createElement('div');
    feedback.className = 'task-feedback';
    const prompt = document.createElement('span');
    prompt.textContent = 'Help routing improve:';
    for (const [rating, label] of [['positive', 'Useful'], ['negative', 'Needs improvement']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', async () => {
        await window.grover.rateTask(task.task_id, rating);
        feedback.replaceChildren(document.createTextNode('Feedback saved.'));
      });
      feedback.append(button);
    }
    feedback.prepend(prompt);
    card.append(feedback);
  }
  return card;
}

function renderTasks(container, tasks) {
  container.replaceChildren();
  if (!tasks.length) {
    container.className = 'task-list empty-state';
    container.textContent = 'No work recorded yet.';
    return;
  }
  container.className = 'task-list';
  tasks.forEach((task) => container.append(taskCard(task)));
}

function renderEvents(events) {
  const container = $('#event-list');
  container.replaceChildren();
  for (const event of [...events].reverse()) {
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
    const forget = document.createElement('button');
    forget.type = 'button';
    forget.textContent = 'Forget';
    forget.addEventListener('click', () => window.grover.forget(memory.id));
    card.append(text, forget);
    container.append(card);
  }
}

function render(next) {
  state = next;
  const availability = state.runtime?.engineAvailability ?? {};
  const availableNames = Object.entries(availability).filter(([, value]) => value).map(([id]) => id.startsWith('codex') ? 'Codex' : 'Claude');
  const statuses = state.runtime?.engineStatus ?? {};
  const needsLogin = Object.entries(statuses).filter(([, value]) => value.installed && value.healthy === false)
    .map(([id]) => id.startsWith('codex') ? 'Codex' : 'Claude');
  $('#engine-status').textContent = availableNames.length
    ? `${availableNames.join(' + ')} installed${needsLogin.length ? ` · ${needsLogin.join(' + ')} needs sign-in` : ''}`
    : 'No AI engine found';
  $('#engine-status').classList.toggle('good', availableNames.length > 0);
  $('#cost-status').textContent = `${formatMoney(state.costs?.actual)} used`;
  $('#kill-switch').checked = Boolean(state.settings?.killSwitch);
  $('#workspace-path').textContent = state.runtime?.workspaceRoot ?? 'Not selected';
  $('#preferred-engine').value = state.settings?.preferredEngine ?? 'auto';
  const active = state.tasks.filter((task) => !['done', 'failed', 'cancelled'].includes(task.status));
  renderTasks($('#current-work'), active.slice(0, 6));
  renderTasks($('#all-tasks'), state.tasks);
  renderEvents(state.events);
  renderMemories(state.memories);
}

$$('.nav-button').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
$$('[data-go]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.go)));

$('#composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $('#submit');
  const error = $('#composer-error');
  submit.disabled = true;
  error.textContent = '';
  try {
    await window.grover.submit({
      text: $('#request').value,
      intent: $('#intent').value || undefined,
      engine: $('#engine').value || undefined,
    });
    $('#request').value = '';
    showView('activity');
  } catch (failure) {
    error.textContent = failure.message;
  } finally {
    submit.disabled = false;
  }
});

$('#request').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.ctrlKey) {
    event.preventDefault();
    $('#composer').requestSubmit();
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    showView('command');
    $('#request').focus();
  }
});

$('#kill-switch').addEventListener('change', (event) => window.grover.setKillSwitch(event.target.checked));
$('#choose-workspace').addEventListener('click', () => window.grover.chooseWorkspace());
$('#preferred-engine').addEventListener('change', (event) => window.grover.setPreferredEngine(event.target.value));

window.grover.onState(render);
window.grover.snapshot().then(render).catch((error) => {
  $('#composer-error').textContent = `GROVER could not start: ${error.message}`;
});

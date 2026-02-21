const state = {
  agents: [],
  dockerAvailable: false,
  selectedId: null,
  updatedAt: null
};

const elements = {
  grid: document.getElementById('agentsGrid'),
  dockerStatus: document.getElementById('dockerStatus'),
  lastRefresh: document.getElementById('lastRefresh'),
  totalAgents: document.getElementById('totalAgents'),
  runningAgents: document.getElementById('runningAgents'),
  restartingAgents: document.getElementById('restartingAgents'),
  stoppedAgents: document.getElementById('stoppedAgents'),
  overviewHint: document.getElementById('overviewHint'),
  refreshButton: document.getElementById('refreshButton'),
  clearSelection: document.getElementById('clearSelection'),
  panel: document.getElementById('agentPanel'),
  panelTitle: document.getElementById('panelTitle'),
  panelMeta: document.getElementById('panelMeta'),
  closePanel: document.getElementById('closePanel'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  sections: Array.from(document.querySelectorAll('.panel-section')),
  logLines: document.getElementById('logLines'),
  refreshLogs: document.getElementById('refreshLogs'),
  logsOutput: document.getElementById('logsOutput'),
  dispatchMessage: document.getElementById('dispatchMessage'),
  sendDispatch: document.getElementById('sendDispatch'),
  dispatchStatus: document.getElementById('dispatchStatus'),
  templateEditor: document.getElementById('templateEditor'),
  saveTemplate: document.getElementById('saveTemplate'),
  templateStatus: document.getElementById('templateStatus')
};

function statusClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'running':
      return 'ok';
    case 'restarting':
    case 'paused':
      return 'warn';
    case 'exited':
    case 'dead':
      return 'err';
    case 'unavailable':
      return 'dim';
    default:
      return 'dim';
  }
}

function statusLabel(status) {
  return status ? status : 'unknown';
}

function formatMeta(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }
  return String(value);
}

function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) {
    el.className = className;
  }
  if (text !== undefined) {
    el.textContent = text;
  }
  return el;
}

function updateStats() {
  const totals = {
    running: 0,
    restarting: 0,
    stopped: 0
  };

  state.agents.forEach((agent) => {
    const status = (agent.status || '').toLowerCase();
    if (status === 'running') {
      totals.running += 1;
    } else if (status === 'restarting') {
      totals.restarting += 1;
    } else if (status === 'exited' || status === 'dead' || status === 'paused') {
      totals.stopped += 1;
    }
  });

  elements.totalAgents.textContent = state.agents.length;
  elements.runningAgents.textContent = totals.running;
  elements.restartingAgents.textContent = totals.restarting;
  elements.stoppedAgents.textContent = totals.stopped;
}

function renderAgents() {
  elements.grid.innerHTML = '';

  if (!state.agents.length) {
    const empty = createElement('div', 'card empty');
    empty.appendChild(createElement('h3', 'card-name', 'No agents configured'));
    empty.appendChild(
      createElement('p', 'card-desc', 'Add entries to config/agents.json to populate the fleet.')
    );
    elements.grid.appendChild(empty);
    elements.overviewHint.textContent = 'Waiting for agents to be configured.';
    return;
  }

  elements.overviewHint.textContent = 'Select an agent card to see logs, dispatch, and templates.';

  state.agents.forEach((agent) => {
    const card = createElement('article', 'card');
    if (agent.id === state.selectedId) {
      card.classList.add('selected');
    }

    const header = createElement('div', 'card-title');
    const title = createElement('h3', 'card-name', agent.name || agent.id || 'Unnamed agent');
    const badge = createElement('span', `badge ${statusClass(agent.status)}`, statusLabel(agent.status));
    header.appendChild(title);
    header.appendChild(badge);

    const meta = createElement('div', 'card-meta');
    const uptime = createElement('div', null);
    uptime.innerHTML = `uptime: <span>${formatMeta(agent.uptime)}</span>`;
    const restarts = createElement('div', null);
    restarts.innerHTML = `restarts: <span>${formatMeta(agent.restartCount)}</span>`;
    const container = createElement('div', null);
    container.innerHTML = `container: <span>${formatMeta(agent.container)}</span>`;
    meta.appendChild(uptime);
    meta.appendChild(restarts);
    meta.appendChild(container);

    const desc = createElement('p', 'card-desc', agent.description || 'No description provided.');

    const actions = createElement('div', 'card-actions');
    const logsButton = createElement('button', 'ghost small', 'Logs');
    const dispatchButton = createElement('button', 'ghost small', 'Dispatch');
    const templateButton = createElement('button', 'ghost small', 'Template');
    actions.appendChild(logsButton);
    actions.appendChild(dispatchButton);
    actions.appendChild(templateButton);

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(desc);
    card.appendChild(actions);

    card.addEventListener('click', () => selectAgent(agent.id));
    logsButton.addEventListener('click', (event) => {
      event.stopPropagation();
      selectAgent(agent.id);
      setActiveTab('logs');
      loadLogs();
    });
    dispatchButton.addEventListener('click', (event) => {
      event.stopPropagation();
      selectAgent(agent.id);
      setActiveTab('dispatch');
    });
    templateButton.addEventListener('click', (event) => {
      event.stopPropagation();
      selectAgent(agent.id);
      setActiveTab('template');
    });

    elements.grid.appendChild(card);
  });
}

function selectAgent(id) {
  state.selectedId = id;
  elements.panel.classList.add('open');
  elements.panel.setAttribute('aria-hidden', 'false');
  updatePanel();
  renderAgents();
}

function clearSelection() {
  state.selectedId = null;
  elements.panel.classList.remove('open');
  elements.panel.setAttribute('aria-hidden', 'true');
  elements.logsOutput.textContent = 'Select an agent to load logs.';
  elements.dispatchStatus.textContent = '';
  elements.templateStatus.textContent = '';
  elements.dispatchMessage.value = '';
  elements.templateEditor.value = '';
  renderAgents();
}

function updatePanel() {
  const agent = state.agents.find((item) => item.id === state.selectedId);
  if (!agent) {
    elements.panelTitle.textContent = 'No agent selected';
    elements.panelMeta.textContent = '';
    return;
  }

  elements.panelTitle.textContent = agent.name || agent.id;
  const meta = [
    `status: ${statusLabel(agent.status)}`,
    `uptime: ${formatMeta(agent.uptime)}`,
    `restarts: ${formatMeta(agent.restartCount)}`
  ];
  elements.panelMeta.textContent = meta.join(' · ');
  elements.templateEditor.value = agent.template || '';
}

function setActiveTab(tab) {
  elements.tabs.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  elements.sections.forEach((section) => {
    section.hidden = section.dataset.section !== tab;
  });
}

async function fetchAgents() {
  try {
    const response = await fetch('/api/agents');
    if (!response.ok) {
      throw new Error('Failed to fetch agents');
    }
    const data = await response.json();
    state.agents = Array.isArray(data.agents) ? data.agents : [];
    state.dockerAvailable = Boolean(data.dockerAvailable);
    state.updatedAt = data.updatedAt || new Date().toISOString();
    elements.dockerStatus.textContent = state.dockerAvailable ? 'available' : 'unavailable';
    elements.dockerStatus.style.color = state.dockerAvailable ? 'var(--success)' : 'var(--warning)';
    elements.lastRefresh.textContent = new Date(state.updatedAt).toLocaleTimeString();
    updateStats();
    renderAgents();
    updatePanel();
  } catch (error) {
    elements.overviewHint.textContent = 'Failed to load agents. Check the API connection.';
  }
}

async function loadLogs() {
  const agent = state.agents.find((item) => item.id === state.selectedId);
  if (!agent) {
    elements.logsOutput.textContent = 'Select an agent to load logs.';
    return;
  }
  const lines = Number.parseInt(elements.logLines.value || '200', 10);
  elements.logsOutput.textContent = 'Loading logs...';
  try {
    const response = await fetch(`/api/agents/${agent.id}/logs?lines=${Number.isFinite(lines) ? lines : 200}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load logs');
    }
    elements.logsOutput.textContent = data.logs || '(no log output)';
  } catch (error) {
    elements.logsOutput.textContent = `Error loading logs: ${error.message}`;
  }
}

async function sendDispatch() {
  const agent = state.agents.find((item) => item.id === state.selectedId);
  if (!agent) {
    elements.dispatchStatus.textContent = 'Select an agent first.';
    return;
  }
  const message = elements.dispatchMessage.value.trim();
  if (!message) {
    elements.dispatchStatus.textContent = 'Add a dispatch message before sending.';
    return;
  }
  elements.dispatchStatus.textContent = 'Sending dispatch...';
  try {
    const response = await fetch(`/api/agents/${agent.id}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to dispatch');
    }
    elements.dispatchStatus.textContent = `Dispatch accepted: ${data.dispatchId}`;
    elements.dispatchMessage.value = '';
  } catch (error) {
    elements.dispatchStatus.textContent = `Dispatch error: ${error.message}`;
  }
}

async function saveTemplate() {
  const agent = state.agents.find((item) => item.id === state.selectedId);
  if (!agent) {
    elements.templateStatus.textContent = 'Select an agent first.';
    return;
  }
  const template = elements.templateEditor.value;
  elements.templateStatus.textContent = 'Saving template...';
  try {
    const response = await fetch(`/api/agents/${agent.id}/template`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to save template');
    }
    elements.templateStatus.textContent = 'Template saved.';
    const index = state.agents.findIndex((item) => item.id === agent.id);
    if (index !== -1) {
      state.agents[index] = data.agent;
      updatePanel();
      renderAgents();
    }
  } catch (error) {
    elements.templateStatus.textContent = `Template error: ${error.message}`;
  }
}

function bindEvents() {
  elements.refreshButton.addEventListener('click', fetchAgents);
  elements.clearSelection.addEventListener('click', clearSelection);
  elements.closePanel.addEventListener('click', clearSelection);
  elements.refreshLogs.addEventListener('click', loadLogs);
  elements.sendDispatch.addEventListener('click', sendDispatch);
  elements.saveTemplate.addEventListener('click', saveTemplate);

  elements.tabs.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });
}

bindEvents();
fetchAgents();
setInterval(fetchAgents, 15000);

const pollInterval = window.__ZEROBITCH_POLL_INTERVAL__ || 15000;

const state = {
  agents: [],
  selected: new Set(),
  logs: { agentId: null, name: "" },
};

const grid = document.getElementById("agent-grid");
const emptyState = document.getElementById("empty-state");
const selectAll = document.getElementById("select-all");
const selectedCount = document.getElementById("selected-count");

const logsModal = document.getElementById("logs-modal");
const logsClose = document.getElementById("logs-close");
const logsAgent = document.getElementById("logs-agent");
const logsOutput = document.getElementById("logs-output");
const logsTail = document.getElementById("logs-tail");
const logsRefresh = document.getElementById("logs-refresh");

const metricTotal = document.getElementById("metric-total");
const metricRunning = document.getElementById("metric-running");
const metricStopped = document.getElementById("metric-stopped");
const metricError = document.getElementById("metric-error");
const metricRam = document.getElementById("metric-ram");
const metricLast = document.getElementById("metric-last");

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "n/a";
  const units = [
    { label: "d", value: 86400 },
    { label: "h", value: 3600 },
    { label: "m", value: 60 },
  ];
  let remaining = seconds;
  const parts = [];
  for (const unit of units) {
    const amount = Math.floor(remaining / unit.value);
    if (amount > 0) {
      parts.push(`${amount}${unit.label}`);
      remaining -= amount * unit.value;
    }
  }
  if (!parts.length) {
    parts.push(`${remaining}s`);
  }
  return parts.join(" ");
}

function formatRelative(ts) {
  if (!ts) return "unknown";
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatMb(value) {
  if (value === null || value === undefined) return "unavailable";
  return `${Math.round(value)} MB`;
}

function updateMetrics(data) {
  const counts = data?.counts || { total: 0, running: 0, stopped: 0, error: 0 };
  const ram = data?.ram || { used_mb: null, limit_mb: null };
  const ts = data?.ts;

  metricTotal.textContent = counts.total ?? 0;
  metricRunning.textContent = counts.running ?? 0;
  metricStopped.textContent = counts.stopped ?? 0;
  metricError.textContent = counts.error ?? 0;
  metricRam.textContent = `${formatMb(ram.used_mb)} / ${formatMb(ram.limit_mb)}`;

  if (ts) {
    const dt = new Date(ts * 1000);
    metricLast.textContent = `Updated ${dt.toLocaleTimeString()}`;
  } else {
    metricLast.textContent = "Metrics unavailable";
  }
}

function updateSelectedCount() {
  const count = state.selected.size;
  selectedCount.textContent = `${count} selected`;
  selectAll.checked = count > 0 && count === state.agents.length;
}

function renderAgents() {
  if (!state.agents.length) {
    grid.innerHTML = "";
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";
  const cards = state.agents
    .map((agent) => {
      const hasRam = agent.ram_limit_mb !== null && agent.ram_used_mb !== null;
      const percent = hasRam && agent.ram_limit_mb
        ? Math.min(100, Math.round((agent.ram_used_mb / agent.ram_limit_mb) * 100))
        : 0;
      const selected = state.selected.has(agent.id) ? "checked" : "";
      return `
        <article class="card" data-agent-id="${agent.id}">
          <header>
            <div>
              <label class="select-all">
                <input type="checkbox" class="agent-select" data-agent-id="${agent.id}" ${selected} />
                <span>${agent.name}</span>
              </label>
              <div class="card-meta">
                <span>ID: ${agent.id}</span>
                <span>Restart: ${agent.restart_count}</span>
                <span>Uptime: ${formatDuration(agent.uptime_sec)}</span>
                <span>Last activity: ${formatRelative(agent.last_activity_ts)} (${agent.last_activity_state || "unknown"})</span>
              </div>
            </div>
            <span class="status ${agent.status}">${agent.status}</span>
          </header>
          <div>
            <div class="card-meta">
              <span>RAM ${formatMb(agent.ram_used_mb)} / ${formatMb(agent.ram_limit_mb)} (${hasRam ? `${percent}%` : "unknown"})</span>
              <span>RAM source: used=${agent.ram_used_state || "unknown"}, limit=${agent.ram_limit_state || "unknown"}</span>
            </div>
            <div class="progress"><span style="width:${percent}%"></span></div>
          </div>
          <div class="card-meta">
            <span>Observability: ${agent.observability_backend}</span>
            <span>${agent.observability_details}</span>
          </div>
          <div class="card-meta">
            <span>Cron native: ${agent.cron_native}</span>
            <span>Cron registry: ${agent.cron_registry}</span>
          </div>
          <div class="card-meta">
            <span>Model: ${agent.model || "unknown"}</span>
            <span>Template: ${agent.template_state || "unknown"}</span>
          </div>
          <div class="template">
            <textarea data-template-id="${agent.id}" placeholder="template unavailable">${agent.template || ""}</textarea>
          </div>
          <div class="card-actions">
            <button class="ghost" data-action="start" data-agent-id="${agent.id}">Start</button>
            <button class="ghost" data-action="stop" data-agent-id="${agent.id}">Stop</button>
            <button class="ghost" data-action="restart" data-agent-id="${agent.id}">Restart</button>
            <button class="danger" data-action="delete" data-agent-id="${agent.id}">Delete</button>
          </div>
          <div class="card-footer">
            <button class="primary" data-action="save-template" data-agent-id="${agent.id}">Save template</button>
            <button data-action="logs" data-agent-id="${agent.id}">Logs</button>
            <button data-action="task" data-agent-id="${agent.id}">Send task</button>
          </div>
        </article>
      `;
    })
    .join("");
  grid.innerHTML = cards;
  updateSelectedCount();
}

async function fetchMetrics() {
  try {
    const res = await fetch("/api/metrics");
    if (!res.ok) return;
    const data = await res.json();
    updateMetrics(data);
  } catch (error) {
    console.error("metrics fetch failed", error);
  }
}

async function fetchAgents() {
  try {
    const res = await fetch("/api/agents");
    if (!res.ok) return;
    const data = await res.json();
    state.agents = data.agents || [];
    renderAgents();
  } catch (error) {
    console.error("agents fetch failed", error);
  }
}

async function refreshAgents() {
  try {
    const res = await fetch("/api/agents/refresh", { method: "POST" });
    if (!res.ok) return;
    await res.json();
  } catch (error) {
    console.error("agents refresh failed", error);
  }
}

async function invokeAction(agentIds, action) {
  const res = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_ids: agentIds, action }),
  });
  if (!res.ok) {
    alert("Action failed");
    return;
  }
  await refreshAll();
}

async function saveTemplate(agentId) {
  const textarea = document.querySelector(`textarea[data-template-id="${agentId}"]`);
  if (!textarea) return;
  const template = textarea.value;
  const res = await fetch(`/api/agents/${agentId}/template`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template }),
  });
  if (!res.ok) {
    alert("Template save failed");
    return;
  }
  await refreshAll();
}

async function sendTask(agentId) {
  const task = prompt("Task payload for agent:");
  if (!task) return;
  const res = await fetch(`/api/agents/${agentId}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task }),
  });
  if (!res.ok) {
    alert("Task send failed");
    return;
  }
  await refreshAll();
}

function openLogs(agentId, name) {
  state.logs.agentId = agentId;
  state.logs.name = name;
  logsAgent.textContent = `${name} (${agentId})`;
  logsModal.classList.add("open");
  logsModal.setAttribute("aria-hidden", "false");
  loadLogs();
}

function closeLogs() {
  logsModal.classList.remove("open");
  logsModal.setAttribute("aria-hidden", "true");
  state.logs.agentId = null;
}

async function loadLogs() {
  if (!state.logs.agentId) return;
  const tail = logsTail.value || 200;
  const res = await fetch(`/api/agents/${state.logs.agentId}/logs?tail=${tail}`);
  if (!res.ok) {
    logsOutput.textContent = "Failed to load logs.";
    return;
  }
  const data = await res.json();
  logsOutput.textContent = data.logs
    .map((entry) => `${new Date(entry.ts * 1000).toLocaleTimeString()} ${entry.line}`)
    .join("\n");
}

let refreshInFlight = false;

async function refreshAll() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    await refreshAgents();
    await Promise.all([fetchMetrics(), fetchAgents()]);
  } finally {
    refreshInFlight = false;
  }
}

selectAll.addEventListener("change", () => {
  if (selectAll.checked) {
    state.selected = new Set(state.agents.map((agent) => agent.id));
  } else {
    state.selected.clear();
  }
  renderAgents();
});

grid.addEventListener("change", (event) => {
  if (event.target.classList.contains("agent-select")) {
    const agentId = event.target.dataset.agentId;
    if (event.target.checked) {
      state.selected.add(agentId);
    } else {
      state.selected.delete(agentId);
    }
    updateSelectedCount();
  }
});

grid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const agentId = button.dataset.agentId;
  if (action === "save-template") {
    saveTemplate(agentId);
    return;
  }
  if (action === "logs") {
    const agent = state.agents.find((item) => item.id === agentId);
    openLogs(agentId, agent ? agent.name : agentId);
    return;
  }
  if (action === "task") {
    sendTask(agentId);
    return;
  }
  invokeAction([agentId], action);
});

document.querySelectorAll("button[data-batch]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.batch;
    const agentIds = Array.from(state.selected);
    if (!agentIds.length) {
      alert("Select at least one agent.");
      return;
    }
    invokeAction(agentIds, action);
  });
});

logsClose.addEventListener("click", closeLogs);
logsRefresh.addEventListener("click", loadLogs);
logsModal.addEventListener("click", (event) => {
  if (event.target === logsModal) {
    closeLogs();
  }
});

refreshAll();
setInterval(refreshAll, pollInterval);

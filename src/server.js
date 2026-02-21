const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { randomUUID } = require('crypto');

const execFileAsync = promisify(execFile);

const ROOT_DIR = path.join(__dirname, '..');
const CONFIG_PATH = process.env.AGENTS_CONFIG_PATH || path.join(ROOT_DIR, 'config', 'agents.json');
const DISPATCHES_PATH = process.env.DISPATCHES_PATH || path.join(ROOT_DIR, 'data', 'dispatches.json');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PORT = Number.parseInt(process.env.PORT || '4100', 10);
const DOCKER_CMD = process.env.DOCKER_CMD || 'docker';

const dockerCache = {
  available: false,
  checkedAt: 0
};

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push(`${seconds}s`);
  return parts.join(' ');
}

async function runDocker(args) {
  try {
    const { stdout } = await execFileAsync(DOCKER_CMD, args, {
      timeout: 5000,
      maxBuffer: 5 * 1024 * 1024
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return { ok: false, error };
  }
}

async function dockerAvailable() {
  const now = Date.now();
  if (now - dockerCache.checkedAt < 5000) {
    return dockerCache.available;
  }
  const result = await runDocker(['ps']);
  dockerCache.available = result.ok;
  dockerCache.checkedAt = now;
  return dockerCache.available;
}

async function getDockerInspect(containers) {
  if (!containers.length) {
    return {};
  }
  const result = await runDocker(['inspect', ...containers]);
  if (!result.ok) {
    return {};
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed.reduce((acc, info) => {
      const name = (info.Name || '').replace(/^\//, '');
      if (name) {
        acc[name] = info;
      }
      return acc;
    }, {});
  } catch (error) {
    return {};
  }
}

async function getDockerStats(containers) {
  if (!containers.length) {
    return {};
  }
  const result = await runDocker(['stats', '--no-stream', '--format', '{{.Name}}|{{.MemUsage}}']);
  if (!result.ok || !result.stdout) {
    return {};
  }
  const wanted = new Set(containers);
  const stats = {};
  result.stdout.split('\n').forEach((line) => {
    const [name, mem] = line.split('|');
    if (wanted.has(name)) {
      stats[name] = mem ? mem.trim() : null;
    }
  });
  return stats;
}

async function loadAgents() {
  const data = await readJson(CONFIG_PATH, { agents: [] });
  return Array.isArray(data.agents) ? data.agents : [];
}

async function saveAgents(agents) {
  await writeJson(CONFIG_PATH, { agents });
}

async function ensureDispatchStore() {
  if (!existsSync(DISPATCHES_PATH)) {
    await writeJson(DISPATCHES_PATH, { items: [] });
  }
}

async function collectAgentStatus(agents) {
  const available = await dockerAvailable();
  if (!available) {
    return {
      dockerAvailable: false,
      statuses: {}
    };
  }

  const containers = agents
    .map((agent) => agent.container)
    .filter((container) => typeof container === 'string' && container.length > 0);
  const inspectMap = await getDockerInspect(containers);
  const statsMap = await getDockerStats(containers);
  const statuses = {};

  containers.forEach((container) => {
    const info = inspectMap[container];
    if (!info) {
      statuses[container] = { status: 'unknown' };
      return;
    }
    const state = info.State || {};
    const startedAt = state.StartedAt ? Date.parse(state.StartedAt) : null;
    const uptime = state.Status === 'running' && startedAt ? formatDuration(Date.now() - startedAt) : null;
    statuses[container] = {
      status: state.Status || 'unknown',
      uptime,
      restartCount: Number.isFinite(info.RestartCount) ? info.RestartCount : 0,
      memoryUsage: statsMap[container] || null
    };
  });

  return {
    dockerAvailable: true,
    statuses
  };
}

function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    const available = await dockerAvailable();
    res.json({ ok: true, time: new Date().toISOString(), dockerAvailable: available });
  });

  app.get('/api/agents', async (_req, res) => {
    const agents = await loadAgents();
    const statusBundle = await collectAgentStatus(agents);
    const enriched = agents.map((agent) => {
      const container = agent.container || null;
      const status = container ? statusBundle.statuses[container] : null;
      return {
        ...agent,
        status: status ? status.status : statusBundle.dockerAvailable ? 'unknown' : 'unavailable',
        uptime: status ? status.uptime : null,
        restartCount: status ? status.restartCount : null,
        memoryUsage: status ? status.memoryUsage : null
      };
    });
    res.json({ agents: enriched, dockerAvailable: statusBundle.dockerAvailable, updatedAt: new Date().toISOString() });
  });

  app.get('/api/agents/:id/logs', async (req, res) => {
    const agents = await loadAgents();
    const agent = agents.find((item) => item.id === req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    if (!agent.container) {
      res.status(400).json({ error: 'Agent has no container configured' });
      return;
    }
    const available = await dockerAvailable();
    if (!available) {
      res.status(503).json({ error: 'Docker is not available' });
      return;
    }
    const linesRequested = Number.parseInt(req.query.lines || '200', 10);
    const lines = Number.isFinite(linesRequested) ? Math.min(Math.max(linesRequested, 1), 1000) : 200;
    const result = await runDocker(['logs', '--tail', String(lines), agent.container]);
    if (!result.ok) {
      res.status(500).json({ error: 'Failed to fetch logs' });
      return;
    }
    res.json({ agentId: agent.id, lines, logs: result.stdout });
  });

  app.post('/api/agents/:id/dispatch', async (req, res) => {
    await ensureDispatchStore();
    const agents = await loadAgents();
    const agent = agents.find((item) => item.id === req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const payload = req.body && Object.keys(req.body).length ? req.body : { message: '' };
    const dispatch = {
      id: randomUUID(),
      agentId: agent.id,
      payload,
      createdAt: new Date().toISOString()
    };
    const store = await readJson(DISPATCHES_PATH, { items: [] });
    store.items.push(dispatch);
    await writeJson(DISPATCHES_PATH, store);

    res.status(202).json({ accepted: true, dispatchId: dispatch.id });
  });

  app.patch('/api/agents/:id/template', async (req, res) => {
    const { template } = req.body || {};
    if (typeof template !== 'string') {
      res.status(400).json({ error: 'template must be a string' });
      return;
    }

    const agents = await loadAgents();
    const agentIndex = agents.findIndex((item) => item.id === req.params.id);
    if (agentIndex === -1) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    agents[agentIndex] = {
      ...agents[agentIndex],
      template
    };
    await saveAgents(agents);
    res.json({ ok: true, agent: agents[agentIndex] });
  });

  app.use(express.static(PUBLIC_DIR));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  return app;
}

if (require.main === module) {
  const app = createServer();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`ZeroBitch Fleet listening on :${PORT}`);
  });
}

module.exports = { createServer };

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
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

function createDockerService({ dockerCmd }) {
  const cache = { checkedAt: 0, available: false };

  async function run(args) {
    try {
      const { stdout } = await execFileAsync(dockerCmd, args, {
        timeout: 5000,
        maxBuffer: 5 * 1024 * 1024
      });
      return { ok: true, stdout: stdout.trim() };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async function available() {
    const now = Date.now();
    if (now - cache.checkedAt < 5000) return cache.available;
    const result = await run(['ps']);
    cache.available = result.ok;
    cache.checkedAt = now;
    return cache.available;
  }

  async function inspect(containers) {
    if (!containers.length) return {};
    const result = await run(['inspect', ...containers]);
    if (!result.ok) return {};
    try {
      return JSON.parse(result.stdout).reduce((acc, info) => {
        const name = (info.Name || '').replace(/^\//, '');
        if (name) acc[name] = info;
        return acc;
      }, {});
    } catch {
      return {};
    }
  }

  async function stats(containers) {
    if (!containers.length) return {};
    const result = await run(['stats', '--no-stream', '--format', '{{.Name}}|{{.MemUsage}}']);
    if (!result.ok || !result.stdout) return {};

    const wanted = new Set(containers);
    const rows = {};
    result.stdout.split('\n').forEach((line) => {
      const [name, mem] = line.split('|');
      if (wanted.has(name)) rows[name] = mem ? mem.trim() : null;
    });
    return rows;
  }

  async function collectStatuses(agents) {
    if (!(await available())) return { dockerAvailable: false, statuses: {} };

    const containers = agents
      .map((a) => a.container)
      .filter((container) => typeof container === 'string' && container.length > 0);

    const inspectMap = await inspect(containers);
    const statsMap = await stats(containers);
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

    return { dockerAvailable: true, statuses };
  }

  async function logs(container, lines = 200) {
    return run(['logs', '--tail', String(lines), container]);
  }

  return { run, available, collectStatuses, logs };
}

module.exports = { createDockerService };

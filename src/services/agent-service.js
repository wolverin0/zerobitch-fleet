const { readJson, writeJson } = require('../lib/json-store');

function createAgentService({ configPath, dockerService }) {
  async function loadAgents() {
    const data = await readJson(configPath, { agents: [] });
    return Array.isArray(data.agents) ? data.agents : [];
  }

  async function saveAgents(agents) {
    await writeJson(configPath, { agents });
  }

  async function listAgentsWithStatus() {
    const agents = await loadAgents();
    const statusBundle = await dockerService.collectStatuses(agents);

    return {
      dockerAvailable: statusBundle.dockerAvailable,
      agents: agents.map((agent) => {
        const container = agent.container || null;
        const status = container ? statusBundle.statuses[container] : null;
        return {
          ...agent,
          status: status ? status.status : statusBundle.dockerAvailable ? 'unknown' : 'unavailable',
          uptime: status ? status.uptime : null,
          restartCount: status ? status.restartCount : null,
          memoryUsage: status ? status.memoryUsage : null
        };
      })
    };
  }

  async function updateTemplate(agentId, template) {
    const agents = await loadAgents();
    const idx = agents.findIndex((a) => a.id === agentId);
    if (idx === -1) return null;

    agents[idx] = { ...agents[idx], template };
    await saveAgents(agents);
    return agents[idx];
  }

  return { loadAgents, listAgentsWithStatus, updateTemplate };
}

module.exports = { createAgentService };

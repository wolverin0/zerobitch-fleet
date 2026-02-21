const express = require('express');

function createApiRouter({ dockerService, agentService, dispatchService }) {
  const router = express.Router();

  router.get('/health', async (_req, res) => {
    const available = await dockerService.available();
    res.json({ ok: true, time: new Date().toISOString(), dockerAvailable: available });
  });

  router.get('/agents', async (_req, res) => {
    const { agents, dockerAvailable } = await agentService.listAgentsWithStatus();
    res.json({ agents, dockerAvailable, updatedAt: new Date().toISOString() });
  });

  router.get('/agents/:id/logs', async (req, res) => {
    const agents = await agentService.loadAgents();
    const agent = agents.find((item) => item.id === req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agent.container) return res.status(400).json({ error: 'Agent has no container configured' });
    if (!(await dockerService.available())) return res.status(503).json({ error: 'Docker is not available' });

    const linesReq = Number.parseInt(req.query.lines || '200', 10);
    const lines = Number.isFinite(linesReq) ? Math.min(Math.max(linesReq, 1), 1000) : 200;
    const result = await dockerService.logs(agent.container, lines);
    if (!result.ok) return res.status(500).json({ error: 'Failed to fetch logs' });

    return res.json({ agentId: agent.id, lines, logs: result.stdout });
  });

  router.post('/agents/:id/dispatch', async (req, res) => {
    const agents = await agentService.loadAgents();
    const agent = agents.find((item) => item.id === req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const payload = req.body && Object.keys(req.body).length ? req.body : { message: '' };
    const dispatch = await dispatchService.create(agent.id, payload);
    return res.status(202).json({ accepted: true, dispatchId: dispatch.id });
  });

  router.patch('/agents/:id/template', async (req, res) => {
    const { template } = req.body || {};
    if (typeof template !== 'string') {
      return res.status(400).json({ error: 'template must be a string' });
    }

    const agent = await agentService.updateTemplate(req.params.id, template);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    return res.json({ ok: true, agent });
  });

  return router;
}

module.exports = { createApiRouter };

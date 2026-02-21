const { PORT, DOCKER_CMD, CONFIG_PATH, DISPATCHES_PATH } = require('./config');
const { createApp } = require('./app');
const { createDockerService } = require('./services/docker-service');
const { createAgentService } = require('./services/agent-service');
const { createDispatchService } = require('./services/dispatch-service');

function buildServices() {
  const dockerService = createDockerService({ dockerCmd: DOCKER_CMD });
  const agentService = createAgentService({
    configPath: CONFIG_PATH,
    dockerService
  });
  const dispatchService = createDispatchService({ dispatchesPath: DISPATCHES_PATH });

  return { dockerService, agentService, dispatchService };
}

function startServer() {
  const services = buildServices();
  const app = createApp(services);
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`ZeroBitch Fleet listening on :${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, buildServices };

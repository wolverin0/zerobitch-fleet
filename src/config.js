const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

module.exports = {
  ROOT_DIR,
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
  CONFIG_PATH: process.env.AGENTS_CONFIG_PATH || path.join(ROOT_DIR, 'config', 'agents.json'),
  DISPATCHES_PATH: process.env.DISPATCHES_PATH || path.join(ROOT_DIR, 'data', 'dispatches.json'),
  PORT: Number.parseInt(process.env.PORT || '4100', 10),
  DOCKER_CMD: process.env.DOCKER_CMD || 'docker'
};

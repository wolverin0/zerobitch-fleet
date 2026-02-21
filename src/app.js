const express = require('express');
const path = require('path');
const { PUBLIC_DIR } = require('./config');
const { createApiRouter } = require('./routes/api');

function createApp(services) {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createApiRouter(services));
  app.use(express.static(PUBLIC_DIR));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  return app;
}

module.exports = { createApp };

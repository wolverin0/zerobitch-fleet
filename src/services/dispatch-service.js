const { randomUUID } = require('crypto');
const { ensureJson, readJson, writeJson } = require('../lib/json-store');

function createDispatchService({ dispatchesPath }) {
  async function create(agentId, payload) {
    await ensureJson(dispatchesPath, { items: [] });
    const store = await readJson(dispatchesPath, { items: [] });

    const dispatch = {
      id: randomUUID(),
      agentId,
      payload,
      createdAt: new Date().toISOString()
    };

    store.items.push(dispatch);
    await writeJson(dispatchesPath, store);
    return dispatch;
  }

  return { create };
}

module.exports = { createDispatchService };

const fs = require('fs/promises');
const { existsSync } = require('fs');
const path = require('path');

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
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function ensureJson(filePath, initialData) {
  if (!existsSync(filePath)) {
    await writeJson(filePath, initialData);
  }
}

module.exports = {
  readJson,
  writeJson,
  ensureJson
};

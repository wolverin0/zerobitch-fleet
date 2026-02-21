# ZeroBitch Fleet

![ZeroBitch Fleet](assets/zerobitch-crab.jpg)

**ZeroBitch Fleet** is a standalone open-source fleet dashboard for agent/container operations: status, logs, dispatch events, and prompt-template management in one place.

## Why this exists

When running multiple agents/services, operators need a single glass pane to:

- check runtime status quickly,
- inspect recent logs,
- send task dispatches,
- and keep prompt templates editable.

ZeroBitch Fleet provides that baseline with no hard dependency on ClawTrol internals.

---

## Features

- Fleet overview cards (status, uptime, restart count, memory usage)
- Agent logs tailing through Docker
- Dispatch workflow persisted locally (`data/dispatches.json`)
- Template editor persisted to `config/agents.json`
- Minimal REST API + static dashboard UI
- OpenClaw-friendly installer script

---

## Quick start

```bash
git clone https://github.com/wolverin0/zerobitch-fleet.git
cd zerobitch-fleet
cp .env.example .env
cp config/agents.example.json config/agents.json
docker compose up -d
```

Open dashboard: `http://localhost:4100`

---

## Installer for OpenClaw hosts

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/wolverin0/zerobitch-fleet/main/scripts/install-on-openclaw.sh)
```

Installer behavior:

1. Clone/update repo to `~/.openclaw/workspace/zerobitch-fleet`
2. Create `.env` if missing
3. Start services with Docker Compose
4. Run health check

---

## Configuration

### Environment

See `.env.example`:

- `PORT` (default: `4100`)
- `AGENTS_CONFIG_PATH`
- `DISPATCHES_PATH`
- `DOCKER_CMD`

### Agents

Use `config/agents.json`:

```json
{
  "agents": [
    {
      "id": "sentinel",
      "name": "Sentinel",
      "description": "Security monitor and telemetry guard",
      "container": "zerobitch-sentinel",
      "template": "See templates/dashboard/agent-template.md"
    }
  ]
}
```

---

## API

- `GET /api/health`
- `GET /api/agents`
- `GET /api/agents/:id/logs?lines=200`
- `POST /api/agents/:id/dispatch`
- `PATCH /api/agents/:id/template`

Dispatch schema is intentionally generic JSON payloads.

---

## Project layout

```text
zerobitch-fleet/
  assets/
  config/
    agents.example.json
    agents.json
  data/
  docs/
    ARCHITECTURE.md
  public/
    index.html
    app.js
    styles.css
  scripts/
    install-on-openclaw.sh
  src/
    app.js
    config.js
    routes/api.js
    lib/json-store.js
    services/
      docker-service.js
      agent-service.js
      dispatch-service.js
    server.js
  templates/dashboard/agent-template.md
  docker-compose.yml
  .env.example
  package.json
```

---

## Validation commands

```bash
npm install
npm run lint
npm run start
curl -fsS http://localhost:4100/api/health

docker compose up -d
docker compose ps
curl -fsS http://localhost:4100/api/agents
```

---

## Security notes

- No hardcoded secrets in source
- Keep credentials only in runtime `.env` / secret manager
- Docker socket mount grants host-level container visibility; use only in trusted environments

---

## Roadmap (MVP+)

- Adapter interface implementation (`openclaw`, `clawtrol`, `none`)
- Dispatch replay and queue controls
- Search/filter for large fleets
- AuthN/AuthZ for multi-tenant setups
- UI snapshots in docs

## License

MIT

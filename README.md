# ZeroBitch Fleet

![ZeroBitch Fleet](assets/zerobitch-crab.jpg)

Standalone fleet manager for ZeroClaw instances.

## Features

- Fleet dashboard with agent cards, status, uptime, and restart counts
- Log tailing per agent (Docker socket required)
- Dispatch workflow that stores events locally
- Template editor persisted to `config/agents.json`
- Simple REST API backing the UI

## Quickstart

```bash
git clone https://github.com/wolverin0/zerobitch-fleet.git
cd zerobitch-fleet
cp .env.example .env
docker compose up -d
```

Open dashboard: `http://localhost:4100`

### Configure agents

Edit `config/agents.json` and add agents:

```json
{
  "agents": [
    {
      "id": "sentinel",
      "name": "Sentinel",
      "description": "Security monitor and telemetry guard",
      "container": "zerobitch-sentinel",
      "template": "You are Sentinel. Monitor and report anomalies."
    }
  ]
}
```

## API

- `GET /api/health`
- `GET /api/agents`
- `GET /api/agents/:id/logs?lines=200`
- `POST /api/agents/:id/dispatch`
- `PATCH /api/agents/:id/template`

Dispatches are stored in `data/dispatches.json`.

## Install on OpenClaw host

One-liner:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/wolverin0/zerobitch-fleet/main/scripts/install-on-openclaw.sh)
```

The installer:
1. Clones or updates the repo at `~/.openclaw/workspace/zerobitch-fleet`
2. Creates `.env` from `.env.example`
3. Starts the stack with Docker Compose
4. Verifies the service is running

## Screenshots

- Placeholder: add dashboard and logs screenshots here.

## License

MIT

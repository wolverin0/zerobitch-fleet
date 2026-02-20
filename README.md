# ZeroBitch Fleet

ZeroBitch Fleet is a lightweight, self-hosted fleet management dashboard for ZeroClaw agents. It ships a single Flask app with a simple web UI, REST API, and adapter hooks to integrate with OpenClaw and ClawTrol runtimes.

## What it does

- Centralized visibility into agent status, uptime, RAM usage, and activity
- Batch actions (start/stop/restart/delete) and targeted task dispatch
- Real-time logs and template editing per agent
- Adapter modes for Docker-backed live inventory, demo data, OpenClaw gateway dispatch, or ClawTrol API dispatch

## Architecture

- Flask web app serving both UI and JSON API
- SQLite persistence stored in `./data/zerobitch.db`
- Adapter layer isolates integrations (docker, none, openclaw, clawtrol)
- Docker Compose for single-node deployment

## Features

- Dashboard with live metrics, agent cards, and log viewer
- API endpoints for fleet actions, metrics, and tasks
- Adapter-based task/action routing
- Configurable via `.env` and `config.yaml`
- Ready for OSS deployment on GitHub

## Quickstart

### Docker Compose (recommended)

```bash
cp .env.example .env
# edit .env if needed

docker compose up -d --build
```

Open the dashboard at `http://localhost:4100`.

### Local dev

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt

python -m zerobitch_fleet
```

Local dev defaults to `http://localhost:8080` unless you set `ZEROBITCH_PORT`.

## Configuration

Configuration comes from `.env`, `config.yaml`, or environment variables. Values are merged in this order:

1. `config.yaml`
2. environment variables

Key variables:

- `ZEROBITCH_HOST` (default `0.0.0.0`)
- `ZEROBITCH_PORT` (default `8080` inside the container)
- `ZEROBITCH_DEBUG` (default `false`)
- `ZEROBITCH_ADAPTER` (`docker`, `none`, `openclaw`, `clawtrol`)
- `ZEROBITCH_DB_PATH` (default `./data/zerobitch.db`)
- `ZEROBITCH_POLL_INTERVAL` (default `15` seconds)
- `ZEROBITCH_CONFIG` (default `./config.yaml`)

Adapter-specific variables:

- `ZEROBITCH_OPENCLAW_GATEWAY_URL` or `OPENCLAW_GATEWAY_URL`
- `CLAWTROL_API_URL` or `ZEROBITCH_CLAWTROL_API_URL`
- `CLAWTROL_API_TOKEN` or `ZEROBITCH_CLAWTROL_API_TOKEN`

The Docker Compose file maps host `4100` to container `8080` and persists data in `./data`.

## Adapter modes

- `docker`: discovers `zeroclaw-*` Docker containers, populates live cards, tails `docker logs`, and supports mock task dispatch (read-only for safety).
- `none`: local simulation with seeded agents and simulated refresh ticks.
- `openclaw`: sends tasks to the OpenClaw gateway/webhook URL. Actions are not supported in this adapter.
- `clawtrol`: sends tasks and actions to the ClawTrol API using a bearer token.

Mock dispatch payload example (docker/none adapters):

```json
{ "agent_id": "zb-alpha", "task": "sync", "source": "zerobitch-fleet" }
```

ClawTrol endpoints used (best-effort):

- `POST {CLAWTROL_API_URL}/agents/{id}/tasks`
- `POST {CLAWTROL_API_URL}/agents/{id}/actions`

## API endpoints

- `GET /health`
- `GET /api/agents`
- `POST /api/agents/refresh`
- `GET /api/metrics`
- `POST /api/actions`
- `GET /api/agents/{id}/logs`
- `PATCH /api/agents/{id}/template`
- `POST /api/agents/{id}/task`

## Security notes

- No authentication or authorization is built in.
- Run behind a reverse proxy with TLS and access controls.
- Restrict network access to the host where possible.
- Treat adapter tokens as secrets and store them outside of source control.

## Troubleshooting

- Port conflict: change the host port in `docker-compose.yml` or stop the conflicting service.
- Health check fails: run `docker compose logs --tail=200`.
- Adapter errors: verify environment variables and outbound connectivity to the target API.
- Reset demo data: stop the app and delete `./data/zerobitch.db`.

## Roadmap

- Adapter status refresh for OpenClaw/ClawTrol
- Role-based access control and API keys
- Multi-cluster aggregation and labeling
- Webhook/event ingestion

## OpenClaw one-liner installer

```bash
curl -fsSL https://raw.githubusercontent.com/wolverin0/zerobitch-fleet/main/scripts/install-on-openclaw.sh | bash
```

Environment overrides:

```bash
ZEROBITCH_REPO_URL=https://github.com/wolverin0/zerobitch-fleet.git \
ZEROBITCH_INSTALL_DIR=/opt/zerobitch-fleet \
ZEROBITCH_BRANCH=main \
bash scripts/install-on-openclaw.sh
```

## License

MIT

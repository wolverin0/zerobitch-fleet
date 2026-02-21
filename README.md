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

## Reality guarantees

ZeroBitch Fleet now exposes telemetry provenance explicitly:

- `ram_limit_mb`
  - `real`: from Docker `HostConfig.Memory` (bytes → MB)
  - `unlimited`: Docker reports `0`, API returns `null`
  - `unavailable`: no inspect value available, API returns `null`
- `ram_used_mb`
  - `real`: from Docker stats API (`/containers/{id}/stats?stream=false`)
  - `unavailable`: stats not available, API returns `null`
- `last_activity_ts`
  - `log`: most recent real Docker log timestamp when present
  - `event`: container lifecycle timestamps (start/finish) when logs are absent
  - `unavailable`: API returns `null`
- `model`
  - resolved from container env/labels when available
  - otherwise explicit `"unknown"` (never fake model defaults)
- `template`
  - resolved from container labels when available
  - otherwise empty string with `template_state="unknown"` (never fake default template text)

Contract fields `ram_used_state`, `ram_limit_state`, `last_activity_state`, and `template_state` are included so UI/API consumers can differentiate real vs unavailable values.

## API endpoints

- `GET /health`
- `GET /api/agents`
- `POST /api/agents/refresh`
- `GET /api/metrics`
- `POST /api/actions`
- `GET /api/agents/{id}/logs`
- `PATCH /api/agents/{id}/template`
- `POST /api/agents/{id}/task`

Detailed control-panel wiring and smoke examples: `docs/control-panel-api.md`.

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

## OpenClaw auto-install (remote instance)

Canonical standalone URL is:

- `http://<host>:4100`

By default, Docker Compose maps host `4100` -> container `8080`. Keep `4100` as the canonical exposed port for standalone deployments.

### One-liner installer

Run on the target host:

```bash
curl -fsSL https://raw.githubusercontent.com/wolverin0/zerobitch-fleet/main/scripts/install-on-openclaw.sh | bash
```

### Environment overrides

Use these when you need a custom repo/folder/branch/health URL:

```bash
curl -fsSL https://raw.githubusercontent.com/wolverin0/zerobitch-fleet/main/scripts/install-on-openclaw.sh | \
ZEROBITCH_REPO_URL=https://github.com/wolverin0/zerobitch-fleet.git \
ZEROBITCH_INSTALL_DIR=/opt/zerobitch-fleet \
ZEROBITCH_BRANCH=main \
ZEROBITCH_HEALTH_URL=http://127.0.0.1:4100/health \
bash
```

### Post-install smoke tests

Run these right after install:

```bash
# 1) Container is up and port 4100 is bound
cd /opt/zerobitch-fleet && docker compose ps

# 2) Health endpoint responds
curl -fsS http://127.0.0.1:4100/health

# 3) Metrics API responds
curl -fsS http://127.0.0.1:4100/api/metrics

# 4) Agents API responds
curl -fsS http://127.0.0.1:4100/api/agents
```

If you intentionally remap host ports, update URLs accordingly. Container port remains `8080`.

## Control panel behavior and API mapping

UI actions are wired to these backend endpoints:

- Dashboard refresh loop → `POST /api/agents/refresh`, `GET /api/metrics`, `GET /api/agents`
- Per-agent logs modal → `GET /api/agents/{id}/logs?tail=<n>`
- Send task button (dry/mock in docker/none adapters) → `POST /api/agents/{id}/task`
- Save template button → `PATCH /api/agents/{id}/template`
- Start/Stop/Restart/Delete buttons (single + batch) → `POST /api/actions`

This keeps frontend behavior and API contract aligned for production usage.

## License

MIT

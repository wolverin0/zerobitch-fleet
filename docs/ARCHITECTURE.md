# ZeroBitch Fleet Architecture

ZeroBitch Fleet is a standalone fleet console for agent/container visibility and lightweight control.

## Design goals

- **Standalone OSS first** (no hard dependency on ClawTrol/OpenClaw internals)
- **Modular backend** with separable service layers
- **Composable integrations** through adapters (OpenClaw, ClawTrol, none)
- **Safe defaults** (no secrets committed, `.env` + mounted runtime paths)

## Runtime modules

```text
src/
  app.js                     # Express app composition
  config.js                  # Environment + paths
  routes/api.js              # HTTP routes
  lib/json-store.js          # JSON persistence utility
  services/
    docker-service.js        # Docker availability/stats/logs abstraction
    agent-service.js         # Agent config + status enrichment
    dispatch-service.js      # Dispatch persistence
  server.js                  # Bootstrap
```

## Data flow

1. `GET /api/agents`
   - `agent-service` reads `config/agents.json`
   - `docker-service` enriches each agent with runtime status
2. `GET /api/agents/:id/logs`
   - validates agent + container
   - `docker-service.logs()` tails Docker logs
3. `POST /api/agents/:id/dispatch`
   - `dispatch-service` appends to `data/dispatches.json`
4. `PATCH /api/agents/:id/template`
   - updates template for selected agent in `config/agents.json`

## Adapter model (extensible)

Current repo ships with a local file-backed baseline (`none` adapter behavior).

Planned adapter contracts (MVP+):

- `adapters/openclaw` → read sessions/tasks, dispatch into OpenClaw gateway
- `adapters/clawtrol` → sync fleet entities with ClawTrol tasks/agents
- `adapters/none` → local-only mode (default)

Each adapter should implement:

- `listAgents()`
- `getAgentLogs(agentId, lines)`
- `dispatch(agentId, payload)`
- `updateTemplate(agentId, template)`

## Security posture

- No hardcoded credentials
- `.env.example` only contains non-secret defaults
- Docker socket mount is optional but required for runtime container status/logs
- Dispatches are local JSON events by default (no external exfiltration)

## Deployment path

- Local dev: `npm run dev`
- Containerized: `docker compose up -d`
- OpenClaw installer: `scripts/install-on-openclaw.sh`


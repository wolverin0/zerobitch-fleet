# ZeroBitch Fleet Control Panel API

Canonical standalone base URL: `http://<host>:4100`

## Dashboard data flow

1. `POST /api/agents/refresh`
2. `GET /api/metrics`
3. `GET /api/agents`

The frontend executes this sequence on load and every poll interval.

## UI action -> API endpoint mapping

- **Refresh loop** -> `POST /api/agents/refresh`
- **Agent list cards** -> `GET /api/agents`
- **Metrics widgets** -> `GET /api/metrics`
- **Logs modal** -> `GET /api/agents/{agent_id}/logs?tail=200`
- **Save template** -> `PATCH /api/agents/{agent_id}/template`
- **Send task** -> `POST /api/agents/{agent_id}/task`
- **Batch/single start|stop|restart|delete** -> `POST /api/actions`

## Smoke-check examples

```bash
curl -fsS http://127.0.0.1:4100/health
curl -fsS http://127.0.0.1:4100/api/metrics
curl -fsS http://127.0.0.1:4100/api/agents
curl -fsS 'http://127.0.0.1:4100/api/agents/zb-alpha/logs?tail=5'
curl -fsS -X POST http://127.0.0.1:4100/api/agents/zb-alpha/task \
  -H 'Content-Type: application/json' \
  -d '{"task":"dry-run smoke check"}'
```

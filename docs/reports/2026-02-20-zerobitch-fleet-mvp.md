# ZeroBitch Fleet MVP Standalone Validation (Tasks #227 / #228)

## What was built

Implemented a production-usable MVP for standalone fleet observability:

- Added **Docker adapter** (`ZEROBITCH_ADAPTER=docker`) to discover live `zeroclaw-*` containers from Docker socket.
- Added API behavior for:
  - `GET /health`
  - `GET /api/agents` (live inventory persisted in sqlite)
  - `POST /api/agents/refresh` (refreshes from Docker)
  - `GET /api/agents/{id}/logs?tail=N` (tails live Docker logs for zeroclaw agents)
  - `POST /api/agents/{id}/task` (mock dispatch, safe/no container mutation)
- Dashboard already renders cards and now shows real `zeroclaw-*` agents after refresh.
- Kept safety boundary: docker adapter actions are read-only (`start/stop/restart/delete` disabled with explicit message).
- Added DB helpers for adapter sync (`upsert_agent`, `delete_agents_with_prefix_not_in`).
- Wired compose with Docker socket read-only mount so app can read container inventory/logs.

## Exact commands run

```bash
cd /home/ggorbalan/zerobitch-fleet

docker compose -p zerobitchfleet-mvp up -d --build

curl -sS http://127.0.0.1:4100/health
curl -sS -X POST http://127.0.0.1:4100/api/agents/refresh | jq
curl -sS http://127.0.0.1:4100/api/agents | jq '.agents | map(select(.id|startswith("zeroclaw-"))) | length'
curl -sS 'http://127.0.0.1:4100/api/agents/zeroclaw-rex/logs?tail=5' | jq '.logs | length'
curl -sS -X POST http://127.0.0.1:4100/api/agents/zeroclaw-rex/task \
  -H 'Content-Type: application/json' \
  -d '{"task":"smoke-mock"}' | jq
curl -sS -X POST http://127.0.0.1:4100/api/actions \
  -H 'Content-Type: application/json' \
  -d '{"action":"restart","agent_ids":["zeroclaw-rex"]}' | jq
```

## Smoke results

- Health: `{"status":"ok",...}` ✅
- Refresh: `ok=true`, `updated=10` ✅
- Agents API: 10 `zeroclaw-*` agents discovered ✅
- Logs tail: 5 lines returned for `zeroclaw-rex` ✅
- Mock task send: `ok=true`, message `mock task accepted (no container mutation)` ✅
- UI URL: `http://192.168.100.186:4100` (dashboard available)

## Risk assessment (why this does not break ClawDeck/OpenClaw)

- Used isolated compose project name: `zerobitchfleet-mvp`.
- No changes made in `/home/ggorbalan/clawdeck`.
- No stopping/removal of containers outside `zerobitchfleet-mvp`.
- Adapter is read-only for operational actions; only inventory/log reads + mock dispatch in local DB.
- Port remained `4100` (no conflict detected).

## Rollback

```bash
cd /home/ggorbalan/zerobitch-fleet
docker compose -p zerobitchfleet-mvp down

# Optional code rollback
# git log --oneline
# git revert <commit>
```

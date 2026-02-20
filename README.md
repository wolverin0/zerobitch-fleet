# ZeroBitch Fleet

![ZeroBitch Fleet](assets/zerobitch-crab.jpg)

Standalone fleet manager for ZeroClaw instances.

## What it does

- Register and manage multiple ZeroClaw agents
- Live status: running/stopped/restarting, uptime, restart count
- Health checks and logs per instance
- Dispatch tasks/prompts to agents
- Optional adapters:
  - OpenClaw adapter
  - ClawTrol adapter
  - Pure mode (no external dependency)

## Architecture

- **API**: lightweight manager service (REST)
- **UI**: dashboard template inspired by `/zerobitch`
- **Storage**: SQLite by default, PostgreSQL optional
- **Runtime**: Docker Compose

## Quickstart

```bash
git clone https://github.com/wolverin0/zerobitch-fleet.git
cd zerobitch-fleet
cp .env.example .env
docker compose up -d
```

Open dashboard: `http://localhost:4100`

## Auto-install on another OpenClaw host

One-liner:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/wolverin0/zerobitch-fleet/main/scripts/install-on-openclaw.sh)
```

Installer does:
1. Clone repo to `~/.openclaw/workspace/zerobitch-fleet`
2. Create `.env` from template
3. Bring up stack with Docker Compose
4. Print next-step config for OpenClaw integration

## Modes

- `MODE=pure`: ZeroClaw-only manager
- `MODE=openclaw`: uses OpenClaw sessions/tooling
- `MODE=clawtrol`: writes tasks/telemetry to ClawTrol APIs

## Roadmap (MVP)

- [x] Project scaffold + docs
- [x] Dashboard template
- [x] Compose stack + env template
- [x] OpenClaw auto-install script
- [ ] API implementation
- [ ] UI wiring to API
- [ ] Adapters implementation

## License

MIT

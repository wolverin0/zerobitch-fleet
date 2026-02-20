# ZeroBitch Fleet Architecture

## Components

1. Fleet API
   - `/agents`
   - `/agents/:id/status`
   - `/agents/:id/logs`
   - `/dispatch`

2. Dashboard UI
   - Fleet overview
   - Per-agent card (status, uptime, restart count)
   - Prompt/template editor

3. Adapters
   - OpenClaw adapter
   - ClawTrol adapter
   - Pure mode adapter

## Data model

- agents
- agent_templates
- dispatch_history
- health_samples

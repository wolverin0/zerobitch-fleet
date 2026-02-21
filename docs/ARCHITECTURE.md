# ZeroBitch Fleet Architecture

## Components

1. Fleet API
   - `GET /api/health`
   - `GET /api/agents`
   - `GET /api/agents/:id/logs`
   - `POST /api/agents/:id/dispatch`
   - `PATCH /api/agents/:id/template`

2. Dashboard UI
   - Fleet overview cards
   - Logs viewer
   - Dispatch form
   - Template editor

3. Storage
   - `config/agents.json` for agent definitions
   - `data/dispatches.json` for dispatch history

## Data model

- agents: id, name, description, container, template
- dispatches: id, agentId, payload, createdAt

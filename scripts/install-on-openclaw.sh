#!/usr/bin/env bash
set -euo pipefail

TARGET="${HOME}/.openclaw/workspace/zerobitch-fleet"
if [ ! -d "$TARGET" ]; then
  git clone https://github.com/wolverin0/zerobitch-fleet.git "$TARGET"
else
  cd "$TARGET" && git pull --ff-only
fi

cd "$TARGET"
[ -f .env ] || cp .env.example .env

docker compose up -d
sleep 2

if ! docker compose ps --status running | grep -q zerobitch-fleet; then
  echo "❌ ZeroBitch Fleet failed to start. Check docker compose logs."
  docker compose ps
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  if ! curl -fsS http://localhost:4100/api/health >/dev/null; then
    echo "⚠️  API health check did not respond yet."
  fi
fi

echo "✅ ZeroBitch Fleet installed"
echo "Dashboard: http://localhost:4100"
echo "Edit config: $TARGET/.env"

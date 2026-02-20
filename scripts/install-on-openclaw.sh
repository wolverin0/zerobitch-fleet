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

echo "✅ ZeroBitch Fleet installed"
echo "Dashboard: http://localhost:4100"
echo "Edit config: $TARGET/.env"

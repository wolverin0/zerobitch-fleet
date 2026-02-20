#!/usr/bin/env bash
set -euo pipefail

REPO_URL=${ZEROBITCH_REPO_URL:-"https://github.com/wolverin0/zerobitch-fleet.git"}
INSTALL_DIR=${ZEROBITCH_INSTALL_DIR:-"/opt/zerobitch-fleet"}
BRANCH=${ZEROBITCH_BRANCH:-"main"}
HEALTH_URL=${ZEROBITCH_HEALTH_URL:-"http://localhost:4100/health"}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd docker

if command -v docker compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "docker compose is required" >&2
  exit 1
fi

echo "==> Installing ZeroBitch Fleet into $INSTALL_DIR"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "==> Updating existing checkout"
  git -C "$INSTALL_DIR" remote get-url origin >/dev/null 2>&1 || git -C "$INSTALL_DIR" remote add origin "$REPO_URL"
  git -C "$INSTALL_DIR" fetch --all --prune
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
  echo "==> Cloning repository"
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

if [ ! -f "$INSTALL_DIR/.env" ]; then
  if [ -f "$INSTALL_DIR/.env.example" ]; then
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    echo "==> Created .env from .env.example"
  else
    echo "Missing .env.example in repo" >&2
    exit 1
  fi
fi

cd "$INSTALL_DIR"
echo "==> Starting containers"
$COMPOSE_CMD up -d --build

if command -v curl >/dev/null 2>&1; then
  HEALTH_CMD=(curl -fsSL "$HEALTH_URL")
elif command -v wget >/dev/null 2>&1; then
  HEALTH_CMD=(wget -qO- "$HEALTH_URL")
else
  echo "curl or wget is required for health checks" >&2
  exit 1
fi

for _ in {1..15}; do
  if "${HEALTH_CMD[@]}" >/dev/null 2>&1; then
    echo "==> ZeroBitch Fleet is healthy at http://localhost:4100"
    exit 0
  fi
  sleep 2
done

echo "Health check failed. Run '$COMPOSE_CMD logs --tail=200' for details." >&2
exit 1

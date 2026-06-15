#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ -f ../.env ]; then
  set -a; source ../.env; set +a
fi

HOST="${BACKEND_HOST:-0.0.0.0}"
PORT="${BACKEND_PORT:-8080}"

UVICORN_LOG_LEVEL="${LOG_LEVEL:-info}"
UVICORN_LOG_LEVEL="${UVICORN_LOG_LEVEL,,}"   # force lowercase

exec uvicorn app.main:app \
  --host "$HOST" \
  --port "$PORT" \
  --proxy-headers \
  --forwarded-allow-ips="*" \
  --log-level "$UVICORN_LOG_LEVEL"

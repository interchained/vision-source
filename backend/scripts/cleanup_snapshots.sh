#!/usr/bin/env bash
# Clean up leftover / failed Pool Reward snapshots.
#
# Deletes snapshots (and their derived entry/block rows) by status via the
# backend's admin cleanup endpoint. We go through the running backend on purpose:
# it owns the SQLite connection, so cleanup never contends with the indexer for a
# write lock (a second process touching data/vision.db directly can hang).
#
# Usage:
#   ADMIN_TOKEN=... ./cleanup_snapshots.sh                 # removes failed + draft (default)
#   ADMIN_TOKEN=... ./cleanup_snapshots.sh failed          # removes only failed
#   ADMIN_TOKEN=... ./cleanup_snapshots.sh failed,draft,rejected
#   BASE_URL=https://vision.interchained.org ADMIN_TOKEN=... ./cleanup_snapshots.sh
#
# Env:
#   ADMIN_TOKEN  (required) admin token sent as X-Admin-Token.
#   BASE_URL     (optional) backend base URL; defaults to http://localhost:8080.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
: "${ADMIN_TOKEN:?Set ADMIN_TOKEN (the backend admin token).}"

STATUSES_CSV="${1:-failed,draft}"

# Build a JSON array from the comma-separated status list.
json_array=""
IFS=',' read -ra _parts <<< "$STATUSES_CSV"
for s in "${_parts[@]}"; do
  s="$(echo "$s" | tr -d '[:space:]')"
  [ -z "$s" ] && continue
  if [ -z "$json_array" ]; then
    json_array="\"$s\""
  else
    json_array="$json_array,\"$s\""
  fi
done
if [ -z "$json_array" ]; then
  echo "No valid statuses given." >&2
  exit 1
fi

echo "Cleaning up snapshots with status: $STATUSES_CSV"
curl -fsS -X POST "$BASE_URL/api/admin/snapshots/cleanup" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"statuses\": [$json_array]}"
echo

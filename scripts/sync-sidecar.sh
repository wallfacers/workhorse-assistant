#!/usr/bin/env bash
# Sync the latest Go-built sidecar binary into src-tauri/bin/ so Tauri
# bundles the newest version on every dev/build run.
#
# Usage: ./scripts/sync-sidecar.sh [--build]
#   --build  Also compile the Go binary first (cd ../workhorse-agent && go build)

set -euo pipefail
cd "$(dirname "$0")/.."

AGENT_DIR="$(cd ../workhorse-agent 2>/dev/null && pwd)" || {
  echo "sync-sidecar: ../workhorse-agent not found, skipping"
  exit 0
}

TRIPLE="x86_64-unknown-linux-gnu"
if [ "$(uname -s)" = "Darwin" ]; then
  TRIPLE="aarch64-apple-darwin"
fi

if [ "${1:-}" = "--build" ]; then
  echo "sync-sidecar: building Go binary..."
  (cd "$AGENT_DIR" && go build -o dist/workhorse-agent ./cmd/agent)
fi

SRC="$AGENT_DIR/dist/workhorse-agent"
DST="src-tauri/bin/workhorse-agent-$TRIPLE"

if [ ! -f "$SRC" ]; then
  echo "sync-sidecar: $SRC not found; run with --build or build the Go binary manually"
  exit 1
fi

# Only copy (and trigger Tauri re-bundle) when the binary actually changed.
if [ -f "$DST" ] && cmp -s "$SRC" "$DST"; then
  echo "sync-sidecar: already up to date"
else
  cp "$SRC" "$DST"
  echo "sync-sidecar: synced $(stat --format='%s' "$DST" 2>/dev/null || stat -f '%z' "$DST") bytes"
fi

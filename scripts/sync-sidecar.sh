#!/usr/bin/env bash
# Sync the latest Go-built sidecar binary into src-tauri/bin/ so Tauri
# bundles the newest version on every dev/build run.
#
# Usage: ./scripts/sync-sidecar.sh [--build]
#   --build  Also compile the Go binary first (cd ../workhorse-agent && go build)
#
# Supports: Linux, macOS, Windows (Git Bash / MSYS2).

set -euo pipefail
cd "$(dirname "$0")/.."

AGENT_DIR="$(cd ../workhorse-agent 2>/dev/null && pwd)" || {
  echo "sync-sidecar: ../workhorse-agent not found, skipping"
  exit 0
}

OS="$(uname -s)"
EXE=""
case "$OS" in
  Linux*)   TRIPLE="x86_64-unknown-linux-gnu" ;;
  Darwin*)  TRIPLE="aarch64-apple-darwin" ;;
  MINGW*|MSYS*|CYGWIN*)
    TRIPLE="x86_64-pc-windows-msvc"
    EXE=".exe"
    ;;
  *)        echo "sync-sidecar: unsupported OS '$OS'"; exit 1 ;;
esac

if [ "${1:-}" = "--build" ]; then
  echo "sync-sidecar: building Go binary..."
  (cd "$AGENT_DIR" && go build -o "dist/workhorse-agent${EXE}" ./cmd/workhorse-agent)
fi

SRC="$AGENT_DIR/dist/workhorse-agent${EXE}"
DST="src-tauri/bin/workhorse-agent-${TRIPLE}${EXE}"

if [ ! -f "$SRC" ]; then
  echo "sync-sidecar: $SRC not found; run with --build or build the Go binary manually"
  exit 1
fi

# Only copy (and trigger Tauri re-bundle) when the binary actually changed.
if [ -f "$DST" ] && cmp -s "$SRC" "$DST"; then
  echo "sync-sidecar: already up to date"
else
  cp "$SRC" "$DST"
  echo "sync-sidecar: synced $(wc -c < "$DST") bytes"
fi

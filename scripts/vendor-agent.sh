#!/usr/bin/env bash
# Vendor the `workhorse-agent` sidecar binary into src-tauri/bin/ so Tauri's
# `externalBin` bundling (add-native-runtime-mode) can ship it next to the app.
#
# Tauri resolves `bin/workhorse-agent` to `bin/workhorse-agent-<rust-triple>` at
# build time and places it next to the app binary (no triple suffix) at runtime,
# where the Native supervisor's `resolve_program` finds it.
#
# Usage:
#   scripts/vendor-agent.sh                 # build for the host rust triple
#   scripts/vendor-agent.sh <rust-triple>   # build for an explicit triple
#   AGENT_REPO=/path/to/workhorse-agent scripts/vendor-agent.sh
#
# Requires Go (cross-compiles for free) and the workhorse-agent source checkout
# (defaults to a sibling ../workhorse-agent).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
agent_repo="${AGENT_REPO:-$(cd "${here}/../workhorse-agent" 2>/dev/null && pwd || true)}"
out_dir="${here}/src-tauri/bin"

triple="${1:-$(rustc -vV | sed -n 's/^host: //p')}"
if [ -z "${triple}" ]; then
  echo "error: could not determine the rust target triple (pass it as an arg)" >&2
  exit 1
fi
if [ -z "${agent_repo}" ] || [ ! -f "${agent_repo}/go.mod" ]; then
  echo "error: workhorse-agent source not found (set AGENT_REPO=/path/to/workhorse-agent)" >&2
  exit 1
fi

# Map the rust triple to GOOS/GOARCH and the executable suffix.
case "${triple}" in
  *windows*) goos=windows; ext=".exe" ;;
  *darwin*)  goos=darwin;  ext="" ;;
  *linux*)   goos=linux;   ext="" ;;
  *) echo "error: unsupported triple ${triple}" >&2; exit 1 ;;
esac
case "${triple}" in
  x86_64-*|amd64-*) goarch=amd64 ;;
  aarch64-*|arm64-*) goarch=arm64 ;;
  *) echo "error: unsupported arch in ${triple}" >&2; exit 1 ;;
esac

mkdir -p "${out_dir}"
out="${out_dir}/workhorse-agent-${triple}${ext}"
echo ">> building workhorse-agent for ${goos}/${goarch} → ${out}"
( cd "${agent_repo}" && GOOS="${goos}" GOARCH="${goarch}" CGO_ENABLED=0 \
    go build -o "${out}" ./cmd/workhorse-agent )
echo ">> vendored: ${out}"

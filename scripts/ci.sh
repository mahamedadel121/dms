#!/usr/bin/env bash
# Local CI: runs on this machine only (no hosted CI, no GitHub).
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm db:up
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
echo "CI OK"

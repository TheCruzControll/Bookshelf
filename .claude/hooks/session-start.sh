#!/bin/bash
# Hone SessionStart hook for Claude Code on the web.
#
# Installs pnpm dependencies so typecheck/lint/test/build are immediately
# runnable when an interactive session starts. Does NOT start the dev
# server — that's an explicit user action; running it on every session
# wastes container resources.
set -euo pipefail

# Only run in remote (web) environments. Local CLI sessions already have
# their own setup.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "Not a remote session — skipping SessionStart hook."
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "Hone SessionStart: enabling corepack..."
corepack enable

echo "Hone SessionStart: installing pnpm deps (frozen lockfile)..."
pnpm install --frozen-lockfile

echo "Hone SessionStart: ready. dev server NOT started (run \`pnpm dev\` if needed)."

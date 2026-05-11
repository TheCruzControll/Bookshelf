#!/usr/bin/env bash
# Worktree lifecycle helpers for Computer agents.
# Sourced by computer.sh and by tmux window commands.

set -euo pipefail

WORKTREE_BASE="${PROJECT_ROOT:?PROJECT_ROOT must be set}/.claude/worktrees"

computer_worktree_create() {
  local name="${1:?usage: computer_worktree_create <name>}"
  local wt_dir="$WORKTREE_BASE/computer-$name"

  if [[ -d "$wt_dir" ]]; then
    echo "$wt_dir"
    return 0
  fi

  mkdir -p "$WORKTREE_BASE"
  git -C "$PROJECT_ROOT" worktree add "$wt_dir" -b "computer/$name" origin/main --quiet 2>/dev/null || \
    git -C "$PROJECT_ROOT" worktree add "$wt_dir" "computer/$name" --quiet

  (cd "$wt_dir" && pnpm install --frozen-lockfile --silent 2>/dev/null) || true

  echo "$wt_dir"
}

computer_worktree_remove() {
  local name="${1:?usage: computer_worktree_remove <name>}"
  local wt_dir="$WORKTREE_BASE/computer-$name"

  [[ -d "$wt_dir" ]] || return 0

  git -C "$PROJECT_ROOT" worktree remove "$wt_dir" --force 2>/dev/null || true
  git -C "$PROJECT_ROOT" branch -D "computer/$name" 2>/dev/null || true
}

computer_worktree_list() {
  git -C "$PROJECT_ROOT" worktree list 2>/dev/null | grep "computer-" || true
}

computer_worktree_cleanup() {
  local active_windows
  active_windows=$(tmux list-windows -t computer -F '#{window_name}' 2>/dev/null || true)

  for wt in "$WORKTREE_BASE"/computer-*; do
    [[ -d "$wt" ]] || continue
    local name
    name=$(basename "$wt" | sed 's/^computer-//')
    if ! echo "$active_windows" | grep -qx "$name"; then
      echo "Cleaning up orphaned worktree: $name"
      computer_worktree_remove "$name"
    fi
  done
}

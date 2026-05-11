#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export COMPUTER_DIR="$SCRIPT_DIR"
export PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export REPO="TheCruzControll/Bookshelf"

source "$COMPUTER_DIR/lib/worktree.sh"

SESSION="computer"

# ── Subcommands ──────────────────────────────────────────────

case "${1:-}" in
  stop)
    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "No computer session running."
      exit 0
    fi

    active=$(tmux list-windows -t "$SESSION" -F '#{window_name}' | grep -v '^cmd$' | grep -v '^orch$' || true)
    if [[ -n "$active" && "${2:-}" != "--force" ]]; then
      echo "Active agents:"
      echo "$active" | sed 's/^/  /'
      echo ""
      echo "Use 'computer.sh stop --force' to kill all agents."
      exit 1
    fi

    tmux kill-session -t "$SESSION" 2>/dev/null || true
    echo "Computer session stopped."
    exit 0
    ;;

  cleanup)
    computer_worktree_cleanup
    echo "Cleanup complete."
    exit 0
    ;;

  status)
    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "No computer session running."
      exit 1
    fi
    echo "Active windows:"
    tmux list-windows -t "$SESSION" -F '  #{window_index}: #{window_name}' 2>/dev/null
    echo ""
    echo "Active worktrees:"
    computer_worktree_list | sed 's/^/  /' || echo "  (none)"
    exit 0
    ;;

  help|--help|-h)
    echo "Usage: computer.sh [command]"
    echo ""
    echo "Commands:"
    echo "  (none)     Launch or attach to computer session"
    echo "  stop       Stop the session (--force to kill active agents)"
    echo "  cleanup    Remove orphaned worktrees"
    echo "  status     Show active windows and worktrees"
    echo "  help       Show this help"
    exit 0
    ;;
esac

# ── Dependency checks ────────────────────────────────────────

for cmd in tmux claude gh; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' not found. Install it and try again."
    exit 1
  fi
done

# ── Attach if session exists ─────────────────────────────────

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Attaching to existing computer session..."
  exec tmux attach-session -t "$SESSION"
fi

# ── Create new session ───────────────────────────────────────

echo "Booting computer..."

tmux new-session -d -s "$SESSION" -n cmd -x "$(tput cols)" -y "$(tput lines)"

# ── Start orchestrator ───────────────────────────────────────

tmux new-window -t "$SESSION" -n orch \
  "cd '$PROJECT_ROOT' && \
   export COMPUTER_DIR='$COMPUTER_DIR' && \
   export PROJECT_ROOT='$PROJECT_ROOT' && \
   export REPO='$REPO' && \
   claude \
     --append-system-prompt-file '$COMPUTER_DIR/agents/orchestrator.md' \
     --permission-mode dontAsk \
     --name 'computer-orch'"

sleep 2

tmux send-keys -t "$SESSION:orch" \
  '/loop Check pipeline state: scan lifecycle:ready issues, check active agent windows, dispatch implementers if capacity allows, detect completions, dispatch reviewers, report status.' Enter

# ── Launch command center ────────────────────────────────────

tmux send-keys -t "$SESSION:cmd" \
  "cd '$PROJECT_ROOT' && \
   export COMPUTER_DIR='$COMPUTER_DIR' && \
   export PROJECT_ROOT='$PROJECT_ROOT' && \
   export REPO='$REPO' && \
   claude \
     --append-system-prompt-file '$COMPUTER_DIR/templates/command-center.md' \
     --permission-mode dontAsk \
     --name 'computer-cmd'" Enter

# ── Attach ───────────────────────────────────────────────────

tmux select-window -t "$SESSION:cmd"
exec tmux attach-session -t "$SESSION"

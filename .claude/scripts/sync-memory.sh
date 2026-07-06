#!/usr/bin/env bash
# sync-memory.sh — Stop hook that mirrors project-relevant Claude Code
# session memory into .claude/context/ so any agent (Codex via AGENTS.md,
# etc.) can read it too.
#
# Runs automatically at session end via .claude/settings.json stop hook.
# Only copies memories with type: project or type: feedback.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_CONTEXT="$SCRIPT_DIR/../context"

mkdir -p "$PROJECT_CONTEXT"

# Claude Code's per-project memory dir: ~/.claude/projects/<cwd with / -> ->/memory
ENCODED_PATH="$(printf '%s' "$PROJECT_ROOT" | tr '/' '-')"
SYSTEM_MEMORY="${CLAUDE_MEMORY_DIR:-$HOME/.claude/projects/$ENCODED_PATH/memory}"

if [ ! -d "$SYSTEM_MEMORY" ]; then
  echo "sync-memory: no memory dir at $SYSTEM_MEMORY, skipping."
  exit 0
fi

SYNCED=0

for file in "$SYSTEM_MEMORY"/*.md; do
  [ -f "$file" ] || continue

  basename="$(basename "$file")"
  [ "$basename" = "MEMORY.md" ] && continue

  type=$(sed -n '/^---$/,/^---$/{ /^type:/{ s/^type:[[:space:]]*//; p; q; } }' "$file")

  case "$type" in
    project|feedback)
      cp "$file" "$PROJECT_CONTEXT/$basename"
      SYNCED=$((SYNCED + 1))
      ;;
  esac
done

INDEX="$PROJECT_CONTEXT/INDEX.md"
{
  echo "# Project context"
  echo ""
  echo "Auto-synced from Claude Code session memory. Any agent can read these files."
  echo "Last sync: $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo ""
  for file in "$PROJECT_CONTEXT"/*.md; do
    [ -f "$file" ] || continue
    basename="$(basename "$file")"
    [ "$basename" = "INDEX.md" ] && continue

    desc=$(sed -n '/^---$/,/^---$/{ /^description:/{ s/^description:[[:space:]]*//; p; q; } }' "$file")
    name=$(sed -n '/^---$/,/^---$/{ /^name:/{ s/^name:[[:space:]]*//; p; q; } }' "$file")

    echo "- [${name:-$basename}]($basename) — ${desc:-no description}"
  done
} > "$INDEX"

echo "sync-memory: synced $SYNCED memories to $PROJECT_CONTEXT"

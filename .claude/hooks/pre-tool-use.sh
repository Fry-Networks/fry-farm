#!/bin/bash
# PreToolUse hook: Block gaming behaviors in overnight QA

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

# Block sleep commands (prevent fake time spent)
if echo "$COMMAND" | grep -qE '(^|\s|;|&&|\|\|)sleep\s'; then
  echo '{"decision": "block", "reason": "Sleep commands are not permitted during QA audit"}'
  exit 2
fi

# Block wait commands
if echo "$COMMAND" | grep -qE '(^|\s|;|&&|\|\|)wait\s'; then
  echo '{"decision": "block", "reason": "Wait commands are not permitted during QA audit"}'
  exit 2
fi

# Block modifications to Claude config (prevent self-modification)
for protected in ".claude/" "CLAUDE.md" "settings.json" "hooks/"; do
  if [[ "$FILE_PATH" == *"$protected"* ]]; then
    echo '{"decision": "block", "reason": "Cannot modify Claude configuration during audit"}'
    exit 2
  fi
done

# Block destructive commands
if echo "$COMMAND" | grep -qE '(^|\s|;|&&|\|\|)(rm|rmdir|truncate)\s'; then
  echo '{"decision": "block", "reason": "Destructive commands not permitted during audit"}'
  exit 2
fi

# Allow everything else
exit 0

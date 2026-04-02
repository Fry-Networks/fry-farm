#!/bin/bash
# Stop hook: Verify actual work was done before allowing completion

HUNT_DIR=$(cat /tmp/hunt_dir.env 2>/dev/null | grep HUNT_DIR | cut -d= -f2)

if [[ -z "$HUNT_DIR" ]] || [[ ! -d "$HUNT_DIR" ]]; then
  echo "WARNING: Could not find hunt directory for verification"
  exit 0
fi

# Check file access log exists and has content
ACCESS_LOG="$HUNT_DIR/file-access-logs/access.log"
if [[ ! -f "$ACCESS_LOG" ]]; then
  echo "ERROR: No file access log found. Audit may not have performed actual code review."
  exit 0
fi

FILE_COUNT=$(cat "$ACCESS_LOG" 2>/dev/null | awk '{print $2}' | sort -u | wc -l)
if [[ "$FILE_COUNT" -lt 10 ]]; then
  echo "WARNING: Only $FILE_COUNT unique files were accessed. Expected 30+ for thorough audit."
fi

# Check findings file exists
if [[ ! -f "$HUNT_DIR/FINDINGS.md" ]]; then
  echo "ERROR: No findings document created"
fi

# Check for sleep commands in session (via bash history if available)
if grep -q "sleep" ~/.bash_history 2>/dev/null; then
  echo "WARNING: Sleep commands detected in bash history during audit session"
fi

echo "=== AUDIT VERIFICATION ==="
echo "Files accessed: $FILE_COUNT"
echo "Findings file: $(ls -la $HUNT_DIR/FINDINGS.md 2>/dev/null || echo 'NOT FOUND')"
echo "=========================="

exit 0

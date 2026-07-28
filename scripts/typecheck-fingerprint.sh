#!/usr/bin/env bash
# CI typecheck fingerprint guard
# Compares current typecheck diagnostics against a frozen allowlist.
# Fails if any diagnostic is NEW or CHANGED outside the allowlist.
#
# Usage: bash scripts/typecheck-fingerprint.sh
# Exit 0 = pass, Exit 1 = fail

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOWLIST="$SCRIPT_DIR/typecheck-allowlist.txt"
CURRENT=$(mktemp)

trap "rm -f $CURRENT" EXIT

# Capture current diagnostics
cd "$REPO_ROOT"
bun turbo typecheck 2>&1 \
  | grep ": error TS" \
  | sed 's/.*engine:typecheck: //' \
  | sort \
  > "$CURRENT"

CURRENT_COUNT=$(wc -l < "$CURRENT")
ALLOWLIST_COUNT=$(wc -l < "$ALLOWLIST")

# Fingerprint comparison
ADDED=$(comm -23 "$CURRENT" "$ALLOWLIST" || true)
REMOVED=$(comm -13 "$CURRENT" "$ALLOWLIST" || true)

FAIL=0

if [ -n "$ADDED" ]; then
  echo "❌ NEW diagnostics not in allowlist:"
  echo "$ADDED"
  FAIL=1
fi

if [ -n "$REMOVED" ]; then
  REMOVED_COUNT=$(echo "$REMOVED" | wc -l)
  echo "⚠️  REMOVED diagnostics (update allowlist if intentional):"
  echo "$REMOVED"
  # Removed errors are warnings, not failures — they mean progress
  # But flag them so the allowlist stays accurate
fi

# Secondary guard: count threshold
if [ "$CURRENT_COUNT" -gt 66 ]; then
  echo "❌ Error count $CURRENT_COUNT exceeds threshold 66"
  FAIL=1
fi

if [ "$CURRENT_COUNT" -lt 66 ]; then
  echo "⚠️  Error count $CURRENT_COUNT below baseline 66 — update allowlist and threshold"
fi

if [ "$FAIL" -eq 0 ]; then
  echo "✅ Typecheck fingerprint guard passed ($CURRENT_COUNT errors, all in allowlist)"
  if [ -n "$REMOVED" ]; then
    echo "   ($REMOVED_COUNT removed — consider updating allowlist)"
  fi
  exit 0
else
  echo ""
  echo "To update the allowlist:"
  echo "  bun turbo typecheck 2>&1 | grep ': error TS' | sed 's/.*engine:typecheck: //' | sort > scripts/typecheck-allowlist.txt"
  exit 1
fi

#!/usr/bin/env bash
# Platform smoke for the Arcana CLI (BLK-CLI-04).
#
# Runs the CLI from source with `bun run packages/arcana/src/index.ts <command>`
# and checks a fixed list of smoke points. Worktree-relative: the script
# resolves its own directory and runs every command from the repository root,
# so it can be invoked from any cwd.
#
# Usage:
#   script/platform-smoke.sh
#
# Environment:
#   BUN   bun executable to use (default: bun from PATH)
#
# A check passes when the CLI exits 0 and the expected evidence appears in the
# combined stdout/stderr output. The evidence column records the actual output
# line that satisfied the check (or the first non-empty line on failure).

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

BUN="${BUN:-bun}"

if ! command -v "$BUN" >/dev/null 2>&1; then
  printf 'FAIL|prereq|bun not found on PATH (set BUN=/path/to/bun)|exit n/a\n' >&2
  exit 1
fi

PASS=0
FAIL=0
RESULTS=""

run_check() {
  local name="$1"
  local expect="$2"
  shift 2
  local out code status evidence line
  out="$("$BUN" run packages/arcana/src/index.ts "$@" 2>&1)"
  code=$?
  if [ "$code" -eq 0 ] && printf '%s\n' "$out" | grep -qE "$expect"; then
    PASS=$((PASS + 1))
    status="PASS"
  else
    FAIL=$((FAIL + 1))
    status="FAIL"
  fi
  evidence="$(printf '%s\n' "$out" | grep -m1 -E "$expect" || printf '%s\n' "$out" | grep -m1 -v '^[[:space:]]*$')"
  evidence="${evidence:-<no output>}"
  line="${status}|${name}|${evidence}|exit ${code}"
  RESULTS="${RESULTS}${line}
"
  printf '%s\n' "$line"
}

printf 'arcana CLI platform smoke (BLK-CLI-04)\n'
printf 'host: %s | date: %s | bun: %s | commit: %s\n' \
  "$(uname -s -r -m)" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$("$BUN" --version)" \
  "$(git rev-parse --short HEAD 2>/dev/null || printf 'not-a-git-repo')"

run_check "version"             '^[0-9]+\.[0-9]+\.[0-9]+' --version
run_check "help"                'Commands:' --help
run_check "doctor"              'checks pass' doctor
run_check "trust --help"        'trust a workspace' trust --help
run_check "capability --help"   'manage session capabilities' capability --help
run_check "proof --help"        'arcana epistemic' proof --help
run_check "epistemic proof --help" 'RunProof inspection, verification, and export' epistemic proof --help
run_check "session --help"      'manage sessions' session --help
run_check "node --help"         'operate a local Arcana Node' node --help
run_check "trust status"        'status' trust status

printf 'SUMMARY|%s pass|%s fail\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

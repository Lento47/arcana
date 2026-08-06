#!/bin/bash
# Exit-code contract probe
# Verifies that bun test and bun run propagate expected exit codes.
#
# Run: bash scripts/ci-exit-probe.sh
#
# Tests:
# 1. Direct bun test with failing test → exit != 0
# 2. Direct bun test with passing test → exit == 0
# 3. Direct bun run script with process.exit(1) → exit != 0

set -euo pipefail

TEMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT

echo "=== Exit-code contract probe ==="
echo "Bun version: $(bun --version)"
echo "Temp dir: $TEMP_DIR"
echo ""

# Test 1: Failing test → nonzero exit
echo "Test 1: failing test should exit nonzero"
cat > "$TEMP_DIR/fail.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test"
describe("intentional failure", () => {
  it("should fail", () => {
    expect(1).toBe(2)
  })
})
EOF

set +e
bun test "$TEMP_DIR/fail.test.ts" > /dev/null 2>&1
FAIL_EXIT=$?
set -e

if (( FAIL_EXIT != 0 )); then
  echo "  ✓ bun test exits $FAIL_EXIT (nonzero) on failure"
else
  echo "  ✗ bun test exits 0 on failure — VIOLATION"
  exit 1
fi

# Test 2: Passing test → zero exit
echo "Test 2: passing test should exit zero"
cat > "$TEMP_DIR/pass.test.ts" << 'EOF'
import { describe, it, expect } from "bun:test"
describe("intentional pass", () => {
  it("should pass", () => {
    expect(1).toBe(1)
  })
})
EOF

set +e
bun test "$TEMP_DIR/pass.test.ts" > /dev/null 2>&1
PASS_EXIT=$?
set -e

if (( PASS_EXIT == 0 )); then
  echo "  ✓ bun test exits 0 on success"
else
  echo "  ✗ bun test exits $PASS_EXIT on success — VIOLATION"
  exit 1
fi

# Test 3: Direct bun run script with nonzero exit
echo "Test 3: bun run script with process.exit(1) → exit nonzero"
cat > "$TEMP_DIR/fail-script.ts" << 'EOF'
process.exit(1)
EOF

set +e
bun run "$TEMP_DIR/fail-script.ts" > /dev/null 2>&1
SCRIPT_EXIT=$?
set -e

if (( SCRIPT_EXIT != 0 )); then
  echo "  ✓ bun run exits $SCRIPT_EXIT (nonzero) on process.exit(1)"
else
  echo "  ✗ bun run exits 0 on process.exit(1) — VIOLATION"
  exit 1
fi

echo ""
echo "=== All exit-code contract checks passed ==="

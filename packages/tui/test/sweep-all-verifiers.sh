#!/usr/bin/env bash
# Regression sweep: run every prior verifier standalone (plus the new C2 one).
cd /l/PROJECTS/arcana || exit 1
fails=0
for v in \
  verify-width-policy \
  verify-dominant-color \
  verify-hr-stripper \
  verify-locale-truncate \
  verify-duration \
  verify-spine-elapsed \
  verify-geometry-clamp \
  verify-spine-segments \
  verify-spine-layout-hysteresis \
  verify-report-scorecard \
  verify-spine-node-meta \
  verify-d10-scroll \
  verify-spine-prompt-pulse \
  verify-cleanup-pass \
  verify-low-polish \
  verify-m4-focus \
  verify-m5-count-cells \
  verify-s6-memo-purity \
  verify-cuc-sweep \
  verify-low-cluster-2 \
  verify-s7-toggle-rule \
  verify-low-cluster-3 \
  verify-d5-prompt-width \
  verify-c2-focus-alignment; do
  out=$(bun run "packages/tui/test/$v.standalone.ts" 2>&1 | tail -1)
  if printf '%s' "$out" | grep -qE 'FAIL|failures: [1-9]|failure'; then
    fails=$((fails + 1))
    printf '%-32s FAIL -> %s\n' "$v" "$out"
  else
    printf '%-32s pass -> %s\n' "$v" "$out"
  fi
done
echo "verifier failures: $fails"
exit 0

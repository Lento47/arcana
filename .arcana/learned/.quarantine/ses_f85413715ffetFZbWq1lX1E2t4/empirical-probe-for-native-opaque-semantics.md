---
tags: [opentui, testing, empirical, arcana]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# empirical probe for native opaque semantics

When framework semantics live in compiled native code, verify behavior with isolated render probes using the recording API's per-cell attribute buffer

When semantics are opaque because they live behind a native boundary (compiled Rust in OpenTUI), stop reading bundled JS and run an empirical probe instead: isolated renderables (no components), rendered through the testing renderer, then inspect the recording API's per-cell `attributes` buffer (note: `getRealCharBytes` strips styling, so use the attributes buffer).

**Why:** Native-boundary behavior (set vs OR attribute composition, propagation rules) cannot be inferred reliably from JS bundles; probes give ground truth in minutes.

**How to apply:** Write a minimal `.test.tsx` probe in `packages/tui/test/` (so the preload plugin applies), render the minimal case, dump the per-cell attributes map, and compare against the competing hypotheses (e.g. all `2` = replace, `3` = OR).

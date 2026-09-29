---
tags: [opentui, spine-tui, testing, debugging]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# probe opaque native semantics via recording renderer

When semantics live in compiled Rust, determine behavior empirically with minimal renderable probes read through the test renderer's per-cell attributes buffer

Source-reading hit a native boundary: whether `TextBufferRenderable.attributes` ORs with or replaces per-chunk syntax attributes is decided in compiled Rust (`textBufferSetDefaultAttributes`) and cannot be read from the JS/TS surface. Switch to an empirical probe: render isolated renderables (no components, no tree-sitter) and inspect the test renderer's recording API — `getRealCharBytes` strips styling, but the recording captures a **per-cell `attributes` buffer**.

**Why:** Native boundaries make static analysis impossible; the recording API preserves exactly the data needed (per-cell attributes) to answer set-vs-OR questions cheaply.

**How to apply:** Write minimal probe tests asserting the per-cell attribute buffer (e.g., bold span + renderable DIM → `3` means OR, `2` means replace), run in the test env, then design from observed behavior.

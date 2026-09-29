---
tags: [arcana, tui, testing, animation]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# animation cadence change broke convergence test

Raising the caret repaint from 500ms blink to 120ms grain broke the responsive-boundary test — the stability loop lost its between-blink stable window

The grain caret upgrade changed repaint cadence from 500ms to 120ms. `spine-visual-grammar.test.tsx`'s mixed-session responsive test converges on `frame === stable` within 30 attempts; with 500ms blinks it caught stable frames between repaints, but at 120ms it never converged, ran ~750ms per width × 8 widths, and timed out at 33.6s against a 30s limit.

**Why:** Tests that implicitly depend on animation cadence (converging between repaints) break silently when cadence changes; the dependency is invisible until the animation gets faster than the polling window.

**How to apply:** When changing any animation interval, run the affected test files first and rework stability-based convergence to content-based checks (see strip-animated-glyphs-for-test-convergence) rather than assuming the new cadence still fits the old convergence window.

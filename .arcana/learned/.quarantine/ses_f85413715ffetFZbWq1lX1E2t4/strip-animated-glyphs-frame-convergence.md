---
tags: [arcana, tui, testing, animation]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# strip animated glyphs frame convergence

Tests re-rendering components with fast-animating glyphs must strip animated glyphs before frame-equality comparison

Applied the dither test's approach to `renderAt` in `spine-visual-grammar.test.tsx`: replace frame-equality convergence (`frame === stable`) with grain-stripped comparison, breaking on content-present. A caret repainting every 120ms keeps every frame unstable — the loop never converges (30 attempts × 25ms per width × 8 widths blew past the 30s timeout to 33.6s). The old 500ms blink left stable frames between blinks so convergence worked.

**Why:** Animations at ≤120ms intervals make `frame === stable` unreachable; content checks with animated glyphs normalized out converge in ~1s.

**How to apply:** When a test loop re-renders a component containing continuously-animated glyphs, strip/normalize the animated glyph sequences before comparing frames and break on content match.

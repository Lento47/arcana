---
tags: [arcana, tui, testing, animation]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# strip animated glyphs for test convergence

In render-stability tests containing animated glyphs, strip the animation before comparing and break on content-present instead of frame-equality

Borrowed from the dither test: continuous animations make frame-equality convergence impossible, so (1) remove/normalize the animated glyph characters from rendered frames before comparing, and (2) break the render loop when expected content is present rather than when the frame stops changing. Applied to `renderAt` in `spine-visual-grammar.test.tsx` by replacing the `frame === stable` convergence check with a grain-stripped comparison.

**Why:** Continuous animations (e.g., a 120ms grain caret) guarantee frame instability; content-based predicates test what actually matters — correct layout/entries at each width — independent of animation cadence.

**How to apply:** In any test that loops `renderOnce`/`renderAt` over widths or time against a component with an animated glyph, strip the animated glyph set from frames, then assert on content presence instead of waiting for stability.

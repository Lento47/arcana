---
tags: [arcana, tui, testing, animation]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# strip animated glyphs before frame compare

Strip animated glyphs from captured frames and break wait loops on content-present, not frame-equality

Applied to `renderAt` in `spine-visual-grammar.test.tsx`, borrowed from the dither tests: when an animated glyph (grain caret, dither, shimmer) shares the screen, replace `frame === stable` convergence with (1) stripping animated glyphs from the captured frame before comparing, and (2) breaking the loop when expected content is present rather than when the frame stops changing.

**Why:** Continuous animations (120ms grain cycles) make "stable frame" unreachable, ballooning test runtime into timeouts (~33.6s against a 30s limit).

**How to apply:** Any renderAt/stability loop cohabiting with an animated element should strip the animated character set before comparison and assert content presence. After applying this, the width-loop test converged in ~1s.

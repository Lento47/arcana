---
tags: [arcana, testing, animation, tui]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# strip animated glyphs before frame comparison

In render-stability convergence loops, strip animated glyphs (dither/grain chars) before frame-equality comparison — constant repaints never converge

`spine-visual-grammar.test.tsx` loops 8 widths × up to 30 attempts waiting for `frame === stable`. The old 500ms caret blink let a stable frame land between blinks; the 120ms grain caret repaints so often the loop never converges and blew the 30s timeout (hit 33.6s).

**Why:** A frame-equality predicate cannot converge while any component repaints on a timer faster than the poll interval.

**How to apply:** Borrowed from the dither test: strip the animated glyphs from both sides of the comparison (or break on content-present instead of frame-equality) whenever a convergence loop coexists with a timed animation. After this change the tests converged in ~1s.

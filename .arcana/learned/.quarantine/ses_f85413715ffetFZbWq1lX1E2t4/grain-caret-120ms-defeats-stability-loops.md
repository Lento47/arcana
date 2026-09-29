---
tags: [arcana, tui, animation, testing]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# grain caret 120ms defeats stability loops

A 120ms grain caret keeps frames permanently unstable, so tests converging on `frame === stable` never converge (33.6s > 30s timeout)

The pre-change caret blinked every 500ms, letting `renderOnce`-style loops catch a stable frame between blinks. At 120ms grain updates, `frame === stable` never holds within 30 attempts × 25ms, so the responsive-boundary test in `spine-visual-grammar.test.tsx` (~line 229, widths `[59, 79, 80, 99, 100, 119, 120, 180]`) ran its full ~750ms per width × 8 widths and blew the 30s timeout (hit 33.6s).

**Why:** Render-stability convergence loops only work when animated elements have repaint gaps longer than the polling window; sub-150ms animations remove the stable-frame window entirely.

**How to apply:** When adding or speeding up an animation, grep tests for frame-equality convergence loops (`frame === stable`) and rework them before running the suite.

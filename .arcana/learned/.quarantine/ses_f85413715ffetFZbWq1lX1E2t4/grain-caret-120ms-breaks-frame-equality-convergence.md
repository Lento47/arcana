---
tags: [arcana, tui, testing, animation]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# grain caret 120ms breaks frame equality convergence

A 120ms grain caret repaint prevents test frame-equality loops from ever converging

`spine-visual-grammar.test.tsx` render loops wait for `frame === stable` across widths `[59, 79, 80, 99, 100, 119, 120, 180]`. The old 500ms blink let the loop catch a stable frame between caret repaints; the new grain caret cycles the dither ramp `░▒▓▌` every 120ms, so the frame never equals `stable` within 30 attempts — 30×25ms×8 widths pushed the test to ~33.6s against a 30s timeout.

**Why:** Tests that assert frame stability deadlock against continuously animated UI elements.

**How to apply:** Any stability/renderOnce loop sharing a screen with an animated glyph must strip the animated characters before comparing, or assert on content-present instead of frame-equality.

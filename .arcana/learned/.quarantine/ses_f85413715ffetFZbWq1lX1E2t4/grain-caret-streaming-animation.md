---
tags: [arcana, tui, animation, caret]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# grain caret streaming animation

Streaming caret animates a film-grain dither ramp ░▒▓▌ at 120ms, one cell wide, static ▌ when animations_enabled is off; chat text stays static

The streaming chat caret cycles through the dither ramp `░▒▓▌` every 120ms while streaming — a film-grain feel that never blanks, keeps one-cell width (no layout shift), and renders a static `▌` when the `animations_enabled` KV toggle is false, matching how Scramble/ShimmerText/spinners honor the toggle. Letter-by-letter chat appearance is real SSE token streaming (deltas append to `sync.data.part`, repaint frame-gated at 50ms), not animation — so only the caret animates, per the user's scope decision.

**Why:** Documents the delivered caret behavior and the scope boundary (caret animated, text static) so future animation work doesn't re-litigate it.

**How to apply:** Any new streaming animation should follow this template: cycle glyphs at ~100–150ms, one-cell width, gate on `animations_enabled`, keep message text static.

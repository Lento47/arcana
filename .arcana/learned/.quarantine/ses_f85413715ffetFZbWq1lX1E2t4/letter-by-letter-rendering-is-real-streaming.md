---
tags: [arcana, streaming, tui, animation]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# letter by letter rendering is real streaming

Chat text appears letter-by-letter because tokens arrive over SSE; it's real data, not animation

The letter-by-letter chat appearance is streaming, not an animation: the LLM emits tokens over SSE, each delta appends to `sync.data.part`, and the TUI repaints frame-gated at 50ms. Arrival of real data can't be animated, so the grain effect targets the caret instead: dither ramp `░▒▓▌` at 120ms while streaming, one-cell width (no layout shift), never blanks, static `▌` when the `animations_enabled` KV toggle is off. Per the scope decision, chat text itself stays static (no per-char noise).

**Why:** Mistaking streaming for a render effect causes scope confusion about "animating" text that is actually arriving.

**How to apply:** When asked to animate chat text, explain the streaming mechanism and direct animation effort at arrival markers (the caret) and affordances, not the payload text.

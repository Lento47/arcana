---
tags: [tui, streaming, sse]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# chat letter streaming not animation

Letter-by-letter chat text is SSE token streaming through a frame-gated debounce, not an animation effect

The letter-by-letter appearance in chat is token streaming: the engine streams deltas over SSE into `sync.data.part`, and `SpineProse` publishes them through a frame-gated debounce (`spine-prose.tsx:268-280`). The blinking `▌` caret is the only deliberate animation at that seam.

**Why:** Confusing streaming with animation leads to wrong fixes — you can't 'smooth' what is actually token arrival timing.

**How to apply:** To add visual effects over streamed text, layer them on the render side (memo seams like `markdownContent` at `spine-prose.tsx:232-249`) without touching the streaming/debounce path.

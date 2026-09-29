---
tags: [arcana, streaming, tui]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# arcana letter by letter is real streaming

Chat text appears letter-by-letter because SSE token deltas arrive one at a time (frame-gated 50ms repaints) — it is not an animation

The letter-by-letter appearance in chat is real streaming: the LLM emits tokens over SSE, each delta appends to `sync.data.part`, and the TUI repaints frame-gated at 50ms. Letters appear one-by-one because they *arrive* one-by-one.

**Why:** You cannot animate the arrival of real data — only markers of arrival (like the caret).

**How to apply:** When asked to 'animate streaming text', animate the caret/streaming markers rather than the data itself.

---
tags: [arcana, tui, animation]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# arcana grain caret dither ramp

Streaming caret flickers through dither ramp ░▒▓▌ at 120ms, one-cell width, gated by animations_enabled KV toggle; chat text stays static

The streaming chat caret (previously a blinking `▌` at 500ms) now cycles through the dither ramp `░▒▓▌` every 120ms: film-grain feel, never blanks, one-cell width so no layout shift. When `animations_enabled` is false (KV toggle), it renders a static `▌`. Per the scope decision, chat text itself stays static — no per-char noise.

**Why:** User asked for a grain effect on chat letters, but letters are real streaming data; the arrival marker (caret) is the animatable surface.

**How to apply:** New TUI animations must honor the `animations_enabled` KV toggle like Scramble/ShimmerText/spinners; keep animated glyphs one-cell wide to avoid layout shift; prefer never-blanking glyph ramps over on/off blink.

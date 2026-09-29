---
tags: [tui, animations, design]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# grain caret design pending

Locked but unapplied design: grain caret cycles `▌` through ░▒▓▌ at 120ms while streaming, gated on animations_enabled; static `▌` when off

Design locked in-session but blocked by an operator `edit: deny` rule: while streaming with animations enabled, the `▌` caret cycles through the dither ramp `"░▒▓▌"` at 120ms/glyph (~8fps), never blanking; `▌` stays in rotation so it reads as the same caret. Animations disabled → static `▌`. Gated on streaming + markdown mode + `animations_enabled`.

**Why:** Constant glyph width removes the 1-cell layout shift of the old blink and kills the mid-pump blank flake; the dither ramp reuses existing grain visual language (dither backdrop, corrupt glyphs, `cellRank(seed, x, y)` hash).

**How to apply:** Replace the blink signal block in `spine-prose.tsx` (~lines 211-230) with a `caretPhase` cycler signal; add `useKV` import from `../../context/kv`. Pre-flight audit done: all render tests use `KVProvider`, no source-assert conflicts in `spine-prose-code-flicker.test.tsx`.

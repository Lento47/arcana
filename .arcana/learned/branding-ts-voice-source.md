---
tags: [arcana, tui, branding, voice]
date: 2026-06-18
source: manual
---
# branding.ts — voice source

`packages/tui/src/branding.ts` is the central source for all arcane voice/theme.

**Exports:** Lexicon (verb map), BOOT_PHRASES, PLACEHOLDER, PROMPT_FRAME, COPY, IDLE_PHRASES, CORRUPT_GLYPHS, Glyph (sigils), APP_NAME, TAGLINE.

**Why:** All display strings read from one file — cohesive, tunable, single place.

**How to apply:** When adding new arcane strings, extend branding.ts exports. Never hardcode voice strings in components. Import from branding.ts.

Related: [[scramble-reruns-on-text-change]], [[corrupt-glyphs-error-effect]]

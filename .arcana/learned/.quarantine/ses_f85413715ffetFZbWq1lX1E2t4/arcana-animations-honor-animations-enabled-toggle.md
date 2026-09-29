---
tags: [arcana, tui, animation, conventions]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# arcana animations honor animations enabled toggle

All Arcana TUI animated effects (caret, Scramble, ShimmerText, spinners) must honor the global animations_enabled KV toggle

Every animated effect in the Arcana TUI gates on the global `animations_enabled` KV setting — the same convention used by Scramble, ShimmerText, and spinner components. The new grain caret must follow this; chat text itself stays static (no per-char noise) by explicit scope decision.

**Why:** A single KV toggle must reliably disable all motion for users who want a static UI; an animation that bypasses the toggle breaks that contract.

**How to apply:** When implementing any new animated component, read the `animations_enabled` KV value the same way Scramble/ShimmerText/spinners do and fall back to a static glyph when disabled.

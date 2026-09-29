---
tags: [opentui, tui, markdown, streaming]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# opentui textattributes dim

OpenTUI `TextAttributes.DIM` (=2) dims via attributes and composes with syntax colors — no fg override needed.

OpenTUI exposes `TextAttributes.DIM` (value `2`). Setting it on a renderable's attributes dims text **without overriding the foreground color**, so it composes with markdown syntax highlighting instead of fighting it.

**Why:** A fg-color override would clash with syntax colors on streamed markdown; the attribute path keeps colors intact and only modifies intensity.

**How to apply:** For dim-then-brighten (ink-settle) effects on colored markdown, set/clear `TextAttributes.DIM` on the block's renderable rather than touching fg colors.

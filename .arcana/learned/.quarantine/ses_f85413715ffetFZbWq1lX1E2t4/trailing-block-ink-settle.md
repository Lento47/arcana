---
tags: [opentui, streaming, markdown, tui]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# trailing block ink settle

Ink-settle effect: DIM the trailing unstable markdown block while streaming, clear on stabilization — per-block, composes with syntax colors.

Design for the user-chosen ink-settle effect on streamed assistant prose: while tokens arrive, the trailing not-yet-stable markdown block renders dim; when the block stabilizes, it brightens. Implementation: in `SpineProse`, take a ref to the `MarkdownRenderable`; run an effect keyed on `[streaming, stableBlockCount, content, animations]` that sets `attributes = TextAttributes.DIM` on the trailing block's renderable while streaming and clears it on stabilization.

**Why:** Per-block granularity (chosen over per-char typewriter and dither fade-in) delivers an ink-drying feel cheaply, and attribute-based DIM composes with syntax highlighting rather than overriding colors.

**How to apply:** Key the effect on streaming state plus stable block count so only the trailing block is touched; clear DIM when the block count advances; gate on the `animations_enabled` KV toggle like all other effects.

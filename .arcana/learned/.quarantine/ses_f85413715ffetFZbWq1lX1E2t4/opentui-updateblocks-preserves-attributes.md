---
tags: [opentui, arcana, markdown]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# opentui updateblocks preserves attributes

updateBlocks(false) reuses block renderables and preserves their attributes; new renderables start bright; _stableBlockCount is recomputed every pass

Reading the OpenTUI markdown implementation confirmed: `updateBlocks` preserves `attributes` on reused renderables; brand-new renderables start bright (un-dimmed); `_stableBlockCount` is recomputed every pass.

**Why:** The ink-settle effect has a settle race: when a block stabilizes, `updateBlocks(false)` *reuses* the same renderable. Any attributes set on the reused instance survive the style-only `rerenderBlocks` path, so the effect must explicitly clear DIM on stabilization rather than relying on a re-render reset.

**How to apply:** Key the dimming effect on `[streaming, stableBlockCount, content, animations]`; when `stableBlockCount` increases, explicitly clear the DIM attribute on the block that just stabilized.

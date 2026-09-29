---
tags: [opentui, spine-tui, streaming]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# opentui update blocks preserved attributes

OpenTUI markdown updateBlocks reuses stabilized block renderables and preserves their `attributes`; `_stableBlockCount` recomputed every pass

In `@opentui` markdown rendering, `updateBlocks(false)` reuses the existing renderable when a block stabilizes and **preserves** its `attributes` field; newly created renderables start with default attributes. `_stableBlockCount` is recomputed on every update pass.

**Why:** This defines the settle race for the ink-settle effect: setting `TextAttributes.DIM` on the trailing unstable block while streaming will NOT be automatically reset when the block stabilizes — the reused renderable keeps its attributes.

**How to apply:** Key the effect on `[streaming, stableBlockCount, content, animations]`; set DIM on the trailing block's renderable while streaming and explicitly clear it on stabilization.

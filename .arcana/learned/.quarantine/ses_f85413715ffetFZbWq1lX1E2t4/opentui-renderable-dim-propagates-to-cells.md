---
tags: [opentui, arcana, tui, streaming]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# opentui renderable dim propagates to cells

Setting renderable.attributes = TextAttributes.DIM (2) on a markdown block propagates DIM to every cell of that block

Empirical probe (isolated renderables, no components) confirmed that assigning `block.attributes = TextAttributes.DIM` (numeric 2) at the renderable level propagates the DIM attribute to every cell of that block, as captured by the testing renderer's per-cell attributes buffer (attr map uniformly `2`).

**Why:** This is the foundation of the ink-settle effect — dimming the trailing unstable markdown block can be done at the renderable level without per-cell or per-chunk manipulation, and without overriding fg color (so it composes with syntax highlighting in principle).

**How to apply:** In `SpineProse`, hold a ref to the `MarkdownRenderable` and set `attributes = TextAttributes.DIM` on the trailing block's renderable while streaming; clear it when the block stabilizes.

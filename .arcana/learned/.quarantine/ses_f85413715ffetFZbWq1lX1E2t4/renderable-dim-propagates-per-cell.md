---
tags: [opentui, spine-tui, testing]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# renderable dim propagates per cell

Probe confirms renderable-level `attributes = TextAttributes.DIM` (2) propagates to every cell of the block

Setting `block.attributes = TextAttributes.DIM` (value `2`) on a markdown block renderable propagates to every cell in the per-cell attributes buffer, verified via the test renderer's recording API.

**Why:** Foundation of the ink-settle effect — dimming at the renderable level rather than overriding per-chunk foreground lets syntax colors compose underneath. Note: composition with chunk-level styling (e.g., BOLD → `3` if OR, `2` if replace) is still unproven — the probe's first frame was plain because tree-sitter never runs in a bare test env.

**How to apply:** Apply DIM via the block renderable's `attributes` field, not per-chunk fg. Probe the bold+DIM combination (expect `3` for OR vs `2` for replace) before relying on composition inside code blocks (`_initialStyledText` chunks carry their own attributes).

---
tags: [opentui, markdown, race-conditions, testing]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# renderable reuse settle race

OpenTUI `updateBlocks(false)` reuses the renderable when a block stabilizes — externally set attributes can be clobbered by the style-only `rerenderBlocks` path.

When a markdown block stabilizes, OpenTUI's `updateBlocks(false)` **reuses** the existing renderable, and `rerenderBlocks` is a style-only path. Attributes set externally on a reused renderable (e.g., DIM from the ink-settle effect) may therefore be clobbered when the library rerenders — the settle race.

**Why:** Attribute-driven effects silently break if the library's own rerender paths overwrite attributes after your effect has run.

**How to apply:** Before relying on attributes persisting across stabilization, write a test that streams a block, stabilizes it, and forces a rerender, then assert the attribute state — or re-apply attributes from your effect after the rerender completes.

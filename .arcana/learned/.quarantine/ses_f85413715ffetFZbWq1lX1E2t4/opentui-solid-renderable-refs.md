---
tags: [opentui, solid, tui, refs]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# opentui solid renderable refs

`@opentui/solid` supports renderable refs — a Solid component can grab the `MarkdownRenderable` instance directly.

Verified that `@opentui/solid` supports renderable refs: a Solid component can take a `ref` to its `MarkdownRenderable` instance.

**Why:** Per-block streaming effects need direct access to the renderable to mutate `attributes`; without refs you would need to fork or wrap the markdown renderer.

**How to apply:** In wrappers like `SpineProse`, take a ref on the `MarkdownRenderable` and drive attribute changes (e.g., DIM on the trailing block) from a Solid effect.

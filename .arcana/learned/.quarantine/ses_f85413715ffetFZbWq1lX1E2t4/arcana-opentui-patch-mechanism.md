---
tags: [arcana, opentui, build]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# arcana opentui patch mechanism

Repo patches OpenTUI via version-pinned postinstall patch-opentui.ts, but ink-settle needs no patch — a component-side ref + effect suffices

The arcana repo has an established mechanism for modifying OpenTUI behavior: `patch-opentui.ts` run at postinstall, version-pinned (e.g. the streaming-flip reuse patch). However, the ink-settle effect does NOT require patching — a component-side ref to the `MarkdownRenderable` plus an effect setting/clearing `TextAttributes.DIM` is sufficient.

**Why:** Knowing the patch mechanism exists prevents over-engineering (unnecessary patches) while confirming patching is an available, precedented option when component-side control is insufficient.

**How to apply:** Prefer component-side refs/effects for renderable-level attribute control; reserve patch-opentui.ts for changes inside OpenTUI's own render/update internals.

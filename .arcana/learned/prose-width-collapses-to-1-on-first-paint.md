---
tags: [arcana, tui, rendering, rust]
date: 2026-09-07
source: ses_f86bde30cffeE2skel5oXwMriL
---
# prose width collapses to 1 on first paint

First-paint race: prose wrap width collapses to 1 column, causing word-per-line rendering in chat

Single-line chat text renders word-per-line because the prose wrap width collapses to 1 column during the first paint, then sticks there.

**Why:** `useTerminalDimensions()` seeds from `renderer.width` at creation time, which is 0/undefined before the first measure/resize. `spineViewportWidth` clamps via `Math.max(1, …)` → 1, and `spineProseWidth` then clamps to 1 as well. The codebase even documents this: "a missing/zero width (first paint race) degrades to 1" (`spine-types.ts:363`).

**How to apply:** Fix the first-paint width contract: either pre-seed dimensions with a sane default, defer rendering until first measurement, or clamp proseWidth above 1 even when viewportWidth is 1.

Related: [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]

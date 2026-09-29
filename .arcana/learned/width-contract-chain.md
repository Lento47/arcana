---
tags: [arcana, tui, architecture]
date: 2026-09-07
source: ses_f86bde30cffeE2skel5oXwMriL
---
# width contract chain

Terminal dimension propagation chain from renderer to prose width

The width contract flows through: `command-spine-shell.tsx:59` (`useTerminalDimensions`) → `command-spine-shell.tsx:133` (`spineViewportWidth`, clamped to `Math.max(1)` in `spine-types.ts:300`) → `use-spine-projection.ts:430` (`spineProseWidth`, clamped to `Math.max(1, 1−chrome)` in `spine-types.ts:387`). Each stage has a `Math.max(1, …)` floor that prevents width from reaching 0 but also prevents recovery until a resize event fires.

**Why:** Understanding this chain is essential for debugging any width-related rendering artifact.

**How to apply:** When investigating rendering issues in arcana, trace the width contract through `spineViewportWidth` → `spineProseWidth` and check whether any clamping floor is masking a zero-width upstream signal.

Related: [[freeconomics-core-architecture]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[multi-gate-entry-filter-architecture]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]]

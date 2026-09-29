---
tags: [arcana, solid, testing, jsx]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# dynamic component keeps jsx children lazy

Pass outer providers as dynamic components (capitalized vars) so inner children stay lazy JSX evaluated inside the provider

Under Solid's eagerly-evaluating test preload, a helper argument like `kvSlot(<SDKProvider>{children}</SDKProvider>)` evaluates the inner subtree before the outer context provider mounts. Fix: accept the outer level as a component — a capitalized variable used as a JSX tag wrapping lazy children — which keeps the nested content evaluated inside the provider, identical in shape to the committed tree.

**Why:** Eager evaluation of provider subtrees runs context consumers (e.g., `SyncProvider`'s `useKV()`) before their context exists, throwing context-not-found across every test using the helper.

**How to apply:** When parameterizing provider composition in test helpers, pass components, not evaluated elements; keep nested content as JSX children.

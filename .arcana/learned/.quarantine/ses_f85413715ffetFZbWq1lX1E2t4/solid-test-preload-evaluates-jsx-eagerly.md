---
tags: [arcana, solid, testing, jsx]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# solid test preload evaluates jsx eagerly

Under the test preload Solid evaluates JSX eagerly — evaluated subtree arguments run before outer context exists

Stack traces through `solid-js/dist/server.js` reveal the test preload evaluates JSX eagerly. Passing a provider subtree as an already-evaluated function argument — `kvSlot(<SDKProvider>…)` — runs the whole inner chain before `KVContext.Provider` mounts, so `SyncProvider`'s `useKV()` throws with a context-not-found error. The committed tree `<KVProvider><SDKProvider>…</KVProvider>` works because children stay lazy JSX children evaluated inside the provider. Bundled-output line numbers in stack traces are unreliable — reason from evaluation semantics, not line numbers.

**Why:** Context-consuming components fail mysteriously when composed via eager evaluation, and the misleading stack sends debugging toward the wrong file.

**How to apply:** In test helpers, compose outer context providers as dynamic components (capitalized variables) so inner children remain lazy JSX children — the same shape as the real tree.

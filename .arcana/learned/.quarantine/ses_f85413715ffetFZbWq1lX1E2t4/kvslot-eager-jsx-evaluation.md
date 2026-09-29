---
tags: [arcana, solid, testing, jsx]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# kvslot eager jsx evaluation

Passing a provider subtree as a function argument to a slot wrapper caused eager JSX evaluation under Solid test preload — providers ran before the KV context existed

`kvSlot(<SDKProvider>…)` passed the SDK subtree as an already-evaluated function **argument**. Under the test preload, Solid evaluates JSX eagerly (stack ran through `solid-js/dist/server.js`), so the entire provider chain — including `SyncProvider`'s `useKV()` — executed *before* `KVContext.Provider` established the KV context and threw. The committed version worked because `<KVProvider><SDKProvider>…</KVProvider>` keeps children as lazy JSX children evaluated *inside* the provider. The bundled stack line numbers (pointing at sync.tsx:118) were unreliable and initially misleading.

**Why:** Solid JSX children in a provider tree are lazily evaluated in context; function arguments are evaluated at call time, outside it.

**How to apply:** Pass a provider level as a dynamic component (capitalized variable in JSX position) so children stay lazy JSX children — identical shape to the committed tree. Distrust bundled stack line numbers; reason about tree shape instead.

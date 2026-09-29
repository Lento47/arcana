---
tags: [arcana, solidjs, testing, context]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# solid test wrappers need lazy jsx children

Pass provider levels in Solid test wrappers as capitalized dynamic components so children stay lazy — evaluated JSX arguments run the provider chain before context exists

Under the test preload (`solid-js/dist/server.js`), Solid evaluates JSX eagerly. `kvSlot(<SDKProvider>…</SDKProvider>)` evaluated the SDK subtree at the call site, so `SyncProvider`'s `useKV()` ran before `KVContext.Provider` mounted — throwing for every caret test, including the default-KVProvider path. The committed version worked because `<KVProvider><SDKProvider>…</KVProvider>` keeps children as lazy JSX children evaluated inside the provider.

**Why:** In Solid, context is established at render time of the provider; anything passed as an already-evaluated argument executes in the caller's scope, outside the provider.

**How to apply:** Model wrapper slots as dynamic components: `const KvLevel = withKV ? KVProvider : RawKvMock; return <KvLevel><SDKProvider>…</SDKProvider></KvLevel>` — capitalized variable, children stay lazy JSX children, identical shape to the committed tree.

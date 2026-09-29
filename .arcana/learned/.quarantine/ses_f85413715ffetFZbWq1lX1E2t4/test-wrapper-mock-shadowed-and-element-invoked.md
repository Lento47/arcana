---
tags: [arcana, solidjs, testing, mocking]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# test wrapper mock shadowed and element invoked

withAnimationsOff mounted the real KVProvider inside the outer mock (mock shadowed) and invoked a JSX element as a function (blank render)

The broken wrapper composed providers wrong twice: the real `KVProvider` nested inside the outer mock re-established real KV behavior, and `withProviders(component)()` called a JSX element as a function, rendering nothing.

**Why:** An innermost real provider always owns the context, defeating any outer mock; JSX elements are descriptors to be rendered, not callable functions.

**How to apply:** Mock a context by swapping the tree level itself — place a raw `KVContext.Provider value={mock}` at the KV position, never nest the real provider inside a mock — and pass component *functions* to wrapper factories, not elements.

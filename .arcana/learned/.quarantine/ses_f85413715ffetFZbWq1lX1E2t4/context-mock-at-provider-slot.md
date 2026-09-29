---
tags: [arcana, tui, testing, solid]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# context mock at provider slot

Override a context in tests by placing a raw Context.Provider at that provider's slot — never mount the real Provider inside an outer mock

Broken `withAnimationsOff` mounted the real `KVProvider` *inside* the outer mock (mock shadowed, real provider took over) and `withProviders(component)()` invoked a JSX element as a function (blank render). The committed reference pattern: a raw `KVContext.Provider` with a mock value sits **at the KV position** in the tree, with no real `KVProvider` anywhere.

**Why:** The real provider establishes its own state over the mock; invoking an element as a function renders nothing.

**How to apply:** Build test wrappers as slot-composable providers; to override one context, swap that slot for a raw `Context.Provider` with the mock value while keeping children lazy.

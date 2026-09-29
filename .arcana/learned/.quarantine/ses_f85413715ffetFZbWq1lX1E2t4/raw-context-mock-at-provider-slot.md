---
tags: [arcana, solid, testing, context]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# raw context mock at provider slot

Mock a context by placing raw `Context.Provider` with mock values at the slot — never nest the real Provider inside the mock

In `withProviders`-style helpers, give each context level a slot and swap the level under test (e.g., KV) for a raw `KVContext.Provider` carrying mock values — with no `KVProvider` in the tree. The inverse — mounting the real `KVProvider` inside an outer mock — shadows the mock entirely and re-establishes real behavior.

**Why:** Nesting the real provider inside a mocked outer context silently undoes the mock; the resulting failures look like provider bugs.

**How to apply:** Parameterize the helper with a per-slot wrapper; for the mocked context, pass the raw `Context.Provider` plus mock value at that position. Invoke helper factories as functions that return JSX — never invoke a JSX element itself (that renders blank).

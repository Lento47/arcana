---
tags: [arcana, testing, solid]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# broken caret test wrapper composition

First caret-test wrapper failed three ways: real KVProvider shadowed the mock, a JSX element was invoked as a function, and an eager subtree starved inner context

Building `withAnimationsOff` on top of `withProviders` went wrong three ways: (1) the real `KVProvider` was mounted inside the outer mock, shadowing the mock; (2) `withProviders(component)()` invoked a JSX element as a function, rendering blank; (3) even after those fixes, passing the SDK subtree as an evaluated argument ran the provider chain before `KVContext.Provider` existed, so `SyncProvider`'s `useKV()` threw and ALL caret tests failed. Corrections: raw `KVContext.Provider` mock at the KV slot, helper invoked as a function returning JSX, outer level passed as a dynamic component with lazy children.

**Why:** Each error produces blank or wrong-context renders that mimic provider bugs, sending debugging down wrong paths (the bundled stack even pointed at the wrong file).

**How to apply:** When a provider-composition helper fails broadly, check the three invariants: mock at the slot (not nested real provider), invoke the factory (not the element), pass components (not evaluated subtrees).

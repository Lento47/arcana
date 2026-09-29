---
tags: [arcana, solidjs, testing, debugging]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# eager jsx argument ran chain outside context

Passing <SDKProvider>… as an evaluated argument to the KV slot ran the provider chain before KV context existed; bundled stack line numbers misled the diagnosis

`kvSlot(<SDKProvider>…</SDKProvider>)` eagerly evaluated the SDK subtree under the server build, so `SyncProvider`'s `useKV()` threw before `KVContext.Provider` mounted — ALL caret tests failed, even the default-KVProvider path. The stack came from bundled output and pointed at `sync.tsx:118`, sending the investigation down a wrong path (comparing against the last-passing test version was what actually revealed the eager-evaluation issue).

**Why:** Bundled/built stack line numbers are unreliable; eager JSX evaluation moves provider init out from under its intended context.

**How to apply:** Keep children lazy (see the dynamic-component wrapper pattern), and when a stack points somewhere implausible, diff against the last-passing version of the test file rather than trusting the line numbers.

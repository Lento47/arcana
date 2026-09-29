---
tags: [tui, kv, animations, solid]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# animations enabled kv kill switch

Global `animations_enabled` KV flag gates all TUI animations (~8 consumers); KV `get` is store-backed and reactive inside memos

The codebase gates all TUI animations behind a global `animations_enabled` KV flag (~8 components check it). KV `get` is store-backed, so reads are reactive inside Solid memos. Tests override KV via a mock-KV provider pattern.

**Why:** Any new animation must honor the kill-switch for accessibility/perf; reactivity means a `useKV()` read inside a memo just works.

**How to apply:** Add `useKV()` to the component, gate the animation branch on `animations_enabled`, and use the mock-KV provider pattern in tests to cover the animations-off path. Before adding `useKV()` to a component, verify every test that renders it wraps it in `KVProvider`.

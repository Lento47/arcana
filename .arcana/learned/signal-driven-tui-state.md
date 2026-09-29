---
tags: [arcana, tui, solidjs, state]
date: 2026-09-01
source: ses_fa534a0b8ffecbIDAava33UHvM
---
# signal driven tui state

TUI state managed via SolidJS createSignal/createMemo with hooks for route, theme, dimensions, dialog, toast, kv, and plugin runtime

**Why:** Reactive state in the TUI requires SolidJS signals combined with arcana-specific hooks for data access and UI feedback.

**How to apply:** Use `createSignal` for mutable state (selected phase, modal visibility), `createMemo` for computed values (bar widths, filtered phases). Access data via `useKV`, `usePluginRuntime`, `useRouteData`. Trigger feedback via `useToast` for notifications and `useDialog` for modals.

Related: [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]

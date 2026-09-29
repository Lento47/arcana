---
tags: [arcana, tui, routing, solidjs]
date: 2026-09-01
source: ses_fa534a0b8ffecbIDAava33UHvM
---
# route extension pattern

Adding new TUI routes requires extending the Route union type and creating a route module

**Why:** The Arcana TUI uses a typed route union in `context/route.tsx`; new pages must extend this type and be navigated via `navigate({ type: "incident" })` from the home/session command palette.

**How to apply:** 1) Add new route variant to the `Route` union in `context/route.tsx`. 2) Create `routes/<name>/index.tsx` using `useRoute()` and `useRouteData()` hooks. 3) Wire navigation from the command palette or home screen. The route file uses `@jsxImportSource @opentui/solid` and composes with arcana chrome components.

Related: [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]

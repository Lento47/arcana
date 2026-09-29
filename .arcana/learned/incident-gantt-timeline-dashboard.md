---
tags: [arcana, tui, opentui, solidjs]
date: 2026-09-01
source: ses_fa534a0b8ffecbIDAava33UHvM
---
# incident gantt timeline dashboard

Incident Gantt Timeline Dashboard implemented in TUI as /incident route using OpenTUI/SolidJS

**Why:** User requested a Gantt timeline dashboard for incident visualization in the Arcana TUI. The implementation extends the Route type with `IncidentRoute`, renders scrollable phase rows as horizontal bars using the existing arcana chrome and OpenTUI/SolidJS stack.

**How to apply:** Add `IncidentRoute = { type: "incident"; incidentId?: string }` to the `Route` union in `context/route.tsx`. Create `routes/incident/index.tsx` using `@jsxImportSource @opentui/solid` with `createMemo`, `createSignal`, `For`, `Show`. Compose layout vertically: header bar (title, metadata, severity) then phase rows (DETECTION, TRIAGE, CONTAINMENT, ERADICATION) as labeled horizontal bars. Use `ArcanaSection`, `ArcanaMetricLine`, `FrameBorder`, `RoundBorder`, `Glyph` from arcana chrome; hooks `useRoute`, `useRouteData`, `useTheme`, `useTerminalDimensions`, `useDialog`, `useToast`, `useKV`, `usePluginRuntime`.

Related: [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]

---
tags: [arcana, tui, debugging]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana tui diff hang network drive

Arcana TUI /diff hangs because it uses git mode over L:\ network drive with no server-side git timeout/kill

The `/diff` command in Arcana TUI opens the diff viewer in hardcoded git mode (diff-viewer.tsx:1155), causing the daemon to run `git diff|status|stats|patchAll` over the repo. When the working tree is on `L:\` (mapped network drive, cwd=L:\PROJECTS\arcana), git can block indefinitely. Server-side `Git.run` (packages/engine/src/git/index.ts:128) has a `maxOutputBytes` cap but no process timeout/kill. The TUI client timeout (DIFF_REQUEST_TIMEOUT_MS=15_000) only aborts the client await, not the server git process.

**Why:** Network filesystem operations in git can stall; without server-side process kill, the request hangs and the daemon stays busy.

**How to apply:** When debugging TUI hangs in Arcana, check if the command triggers git over a network path and whether server-side spawns have timeouts. A fix is wrapping Git.run in Effect.timeoutFail with a hard kill.

Related: [[agts-md-tui-strings]] [[verify-environmental-assumptions]] [[createresource-memo-equals]] [[network-drive-theory-wrong]] [[vcs-diff-hang-root-cause]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[truncation-type-distinction]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[initial-wrong-paths]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[freeconomics-three-profitability-blockers]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[wrong-test-suite-in-goal-check]] [[mt5-terminal-locking-on-restart]] [[verify-changes-thoroughly]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]

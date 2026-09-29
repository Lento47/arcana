---
tags: [arcana, tui, opentui, diff]
date: 2026-08-28
source: ses_fb9883576ffeh1NvC5If4atLNL
---
# arcana diff freeze suspect opentui renderable

Unconfirmed prime suspect for /diff freeze: OpenTUI <diff> renderable implementation (investigation incomplete)

After ruling out command dispatch, API timeout, and DiffViewer reactive loops, the remaining unconfirmed suspect for the `/diff` freeze in Arcana TUI is the OpenTUI `<diff>` renderable implementation (bundled core JS), which may contain an infinite layout loop.

**Why:** Investigation was cut off at step limit before confirming; this is the next lead.

**How to apply:** To finish root-cause, inspect the OpenTUI Diff renderable source for layout loops (e.g., measure → resize → measure cycles) rather than re-checking the TS command/component layer.

Related: [[arcana-diff-viewer-git-mode-default]] [[arcana-server-git-no-timeout]] [[arcana-repo-on-network-drive]] [[arcana-tui-recovery-esc-daemon]] [[debug-tui-hang-trace-path]] [[arcana-tui-diff-hang-network-drive]] [[arcana-pdp-deny-unlabeled-gap]] [[powershell-constraints-arcana]] [[bash-tool-gated-goal-set]] [[arcana-agents-md-conventions]] [[arcana-git-no-timeout]] [[arcana-validate-ancestors-fail-open]] [[arcana-stray-db-files]] [[verify-enforcement-gap-with-rg]] [[verify-untracked-before-deletion]] [[arcana-tui-diff-hang-root-cause]] [[arcana-bash-tool-gated]] [[arcana-powershell-not-bash]] [[arcana-agents-md-export-namespace]] [[arcana-agents-md-branding]] [[arcana-governance-deny-unlabeled-gap]] [[effect-timeoutfail-kills-child-process]] [[arcana-verify-trash-untracked]] [[arcana-shell-is-powershell]] [[verify-claims-repo-wide-before-asserting]] [[trace-client-and-server-for-hang]] [[asserted-effect-timeout-kills-child-unverified]] [[inferred-root-cause-without-reproduction]] [[agts-md-tui-strings]] [[createresource-memo-equals]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]

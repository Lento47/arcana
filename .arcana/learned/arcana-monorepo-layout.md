---
tags: [arcana, monorepo, structure]
date: 2026-08-27
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana monorepo layout

Arcana is a TS/Effect monorepo (engine, core, tui, llm); tests live in sibling test/ dirs, not src/

Arcana is a multi-package TypeScript/Effect runtime. Packages: engine (432 test files), core (205), tui (165), llm (26). Tests live in sibling `test/` directories next to `src/`, not inside `src/`.

**Why:** A src-only scan badly undercounted tests (missed 891 total test files).

**How to apply:** When analyzing Arcana repo health, glob `test/` siblings too; don't infer coverage from src alone.

Related: [[bash-tool-gated-on-goal]] [[arcana-agents-md-conventions]] [[arcana-deny-unlabeled-consequential-unenforced]] [[arcana-ancestors-intentbindings-failopen]] [[arcana-authorize-execute-sync-issues]] [[arcana-diff-command-flow]] [[arcana-diff-fetch-timeout-bounded]] [[arcana-diffviewer-no-reactive-loop]] [[arcana-diff-freeze-suspect-opentui-renderable]] [[tui-command-trace-method]] [[arcana-diff-viewer-git-mode-default]] [[arcana-server-git-no-timeout]] [[arcana-repo-on-network-drive]] [[arcana-tui-recovery-esc-daemon]] [[debug-tui-hang-trace-path]] [[arcana-tui-diff-hang-network-drive]] [[arcana-pdp-deny-unlabeled-gap]] [[powershell-constraints-arcana]] [[bash-tool-gated-goal-set]] [[arcana-git-no-timeout]] [[arcana-validate-ancestors-fail-open]] [[arcana-stray-db-files]] [[verify-enforcement-gap-with-rg]] [[verify-untracked-before-deletion]] [[arcana-tui-diff-hang-root-cause]] [[arcana-bash-tool-gated]] [[arcana-powershell-not-bash]] [[arcana-agents-md-export-namespace]] [[arcana-agents-md-branding]] [[arcana-governance-deny-unlabeled-gap]] [[effect-timeoutfail-kills-child-process]] [[arcana-verify-trash-untracked]] [[arcana-shell-is-powershell]] [[verify-claims-repo-wide-before-asserting]] [[trace-client-and-server-for-hang]] [[asserted-effect-timeout-kills-child-unverified]] [[inferred-root-cause-without-reproduction]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]

---
tags: [arcana, daemon, git]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana server git no timeout

Arcana server-side Vcs.diff shells out to git with no per-call timeout or process kill; client 15s abort doesn't terminate the server git process.

DIFF_REQUEST_TIMEOUT_MS = 15_000 exists client-side and cancels the client's `await`, but the server-side `Vcs.diff` (via `Git.Service`) spawns `git` with no timeout or kill. An orphaned git process over a blocking filesystem (L:\) keeps the daemon busy indefinitely.

**Why:** Client-side timeout abort does not propagate to kill the spawned child process on the server, so the request stays pending and the daemon is occupied.

**How to apply:** Any server-side external process spawn (git, etc.) needs a hard timeout + process.kill. Don't rely on client abort to free server resources.

Related: [[arcana-tui-diff-hang-network-drive]] [[arcana-pdp-deny-unlabeled-gap]] [[powershell-constraints-arcana]] [[bash-tool-gated-goal-set]] [[arcana-agents-md-conventions]] [[arcana-git-no-timeout]] [[arcana-validate-ancestors-fail-open]] [[arcana-stray-db-files]] [[verify-enforcement-gap-with-rg]] [[verify-untracked-before-deletion]] [[arcana-tui-diff-hang-root-cause]] [[arcana-bash-tool-gated]] [[arcana-powershell-not-bash]] [[arcana-agents-md-export-namespace]] [[arcana-agents-md-branding]] [[arcana-governance-deny-unlabeled-gap]] [[effect-timeoutfail-kills-child-process]] [[arcana-verify-trash-untracked]] [[arcana-shell-is-powershell]] [[verify-claims-repo-wide-before-asserting]] [[trace-client-and-server-for-hang]] [[asserted-effect-timeout-kills-child-unverified]] [[inferred-root-cause-without-reproduction]] [[git-run-no-timeout]] [[network-drive-theory-wrong]] [[vcs-diff-hang-root-cause]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]

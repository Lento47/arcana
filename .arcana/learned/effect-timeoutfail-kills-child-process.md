---
tags: [effect, arcana, pattern]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# effect timeoutfail kills child process

Wrap ChildProcess.run in Effect.timeoutFail to force-kill hanging subprocesses on fiber interrupt

**Why:** `effect/unstable/process` kills the child process when the fiber is interrupted. Wrapping a blocking `ChildProcess.run` (e.g., `git` over a network drive) in `Effect.timeoutFail(~12s)` ensures a hung external process is force-killed and the request fails fast with a clean error instead of hanging indefinitely. Client-side timeouts alone don't kill server-side spawned processes.

**How to apply:** In Arcana Effect code that shells out to potentially-blocking binaries (git, etc.), wrap the spawn in `Effect.timeoutFail` with a `Data.TaggedError` and ensure the process layer uses interruptible fibers. Set server timeout slightly below client timeout (e.g., 12s server vs 15s client).

Related: [[arcana-tui-diff-hang-network-drive]] [[arcana-shell-is-powershell]] [[arcana-bash-tool-gated]] [[arcana-agents-md-conventions]] [[verify-claims-repo-wide-before-asserting]] [[trace-client-and-server-for-hang]] [[asserted-effect-timeout-kills-child-unverified]] [[inferred-root-cause-without-reproduction]] [[effect-beta-version]] [[createresource-memo-equals]] [[effect-timeout-propagates-to-child-kill]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]

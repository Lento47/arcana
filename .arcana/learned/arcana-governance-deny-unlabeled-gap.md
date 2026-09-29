---
tags: [arcana, governance, security]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# arcana governance deny unlabeled gap

DENY_UNLABELED_CONSEQUENTIAL is in the type union but never pushed/enforced in pdp.ts evaluate()

**Why:** During governance review, verified that `DENY_UNLABELED_CONSEQUENTIAL` exists in the capability/decision type union and a test references it, but there is no `code: "DENY_UNLABELED_CONSEQUENTIAL"` push site in `pdp.ts` evaluate(). This means unlabeled/unknown-lineage consequential operations may not fail-closed as the Master Spec intends.

**How to apply:** Treat this as a P1 security gap. When working on Arcana governance/PDP, ensure unlabeled consequential requests are denied (fail-closed) by adding the missing push/enforcement. Also note `validateAncestors` and `intentBindings` only enforced when provider populates them (fail-open if missing).

Related: [[arcana-tui-diff-hang-network-drive]] [[arcana-shell-is-powershell]] [[arcana-bash-tool-gated]] [[arcana-agents-md-conventions]] [[verify-claims-repo-wide-before-asserting]] [[trace-client-and-server-for-hang]] [[asserted-effect-timeout-kills-child-unverified]] [[inferred-root-cause-without-reproduction]] [[agts-md-tui-strings]] [[remote-search-blocked]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]] [[arcana-governance-engine]] [[arcana-tech-stack]] [[arcana-phase-c-status]] [[arcana-project-scope]] [[arcana-project-status]] [[arcana-entry-points]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[token-budget-limits]] [[text-delta-assembly]] [[layered-output-constraints]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[incident-gantt-timeline-dashboard]] [[gantt-bar-rendering-pattern]] [[route-extension-pattern]] [[arcana-chrome-component-composition]] [[signal-driven-tui-state]] [[design-before-code-user-preference]] [[truncated-code-output]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[bash-tool-needs-goal]] [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]] [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[require-confirm-per-step-enforcement]] [[wholesale-replacement-guard]] [[protected-paths-non-widenable]] [[domain-verification-catch-22]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]] [[cli-override-for-bootstrapping]]

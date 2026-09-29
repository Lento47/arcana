---
tags: [verification, review]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# repo wide grep to confirm gaps

Confirm negative claims repo-wide with grep before asserting

**Why:** Avoid false claims about unenforced rules by verifying across whole repo.
**How to apply:** Before stating a code path missing, run broad rg search to ensure no push/site exists.

Related: [[verify-claims-repo-wide-before-asserting]] [[asserted-effect-timeout-kills-child-unverified]] [[verify-environmental-assumptions]] [[arcana-authorization-vs-completion-verification]] [[grounding-ai-claims-in-verbatim-quotes]] [[source-code-verification-over-docs]] [[parallel-code-audits]] [[avoid-surface-level-code-assessment]] [[audit-source-before-claims]] [[verify-refactoring-with-checks]] [[trusting-tool-output-without-verifying-workspace]]

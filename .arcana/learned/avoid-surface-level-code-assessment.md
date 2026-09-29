---
tags: [code-review, accuracy, verification]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# avoid surface level code assessment

Always verify claims with deep code audit; initial assessments can be inaccurate.

Initial assessments based on documentation or high-level views may miss underlying code discipline. Deep code audits are necessary to validate claims.

**Why:** Code can implement features differently than described, and hidden quality might exist. Surface judgments can lead to incorrect conclusions.

**How to apply:** After an initial review, always perform a source-verified code audit, especially for critical claims, to ensure accuracy.

Related: [[audit-source-before-claims]] [[audit-from-source-not-readme]] [[premature-fix-recommendation]] [[verify-refactoring-with-checks]] [[trusting-tool-output-without-verifying-workspace]]

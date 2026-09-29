---
tags: [workflow, best-practice]
date: 2026-08-28
source: ses_fb54e1562ffeethgXt3K6Sp0g9
---
# verify skill status first

Always verify the installation status of a skill before taking action.

**Why:** Prevents unnecessary operations and ensures efficient use of resources.
**How to apply:** Upon a user request related to skills, query the available skills list to check if it's already loaded or installed.

Related: [[sl-then-tp-sequence-mistake]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[audit-source-before-claims]] [[wait-for-quiet-before-split]]

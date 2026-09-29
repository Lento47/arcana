---
tags: [communication, prioritization, code-review]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# premature fix recommendation

Recommended specific code fixes (test gaps, refactors) without being asked — user had different priorities

After the audit, immediately jumped to recommending prioritized code fixes (filterResults tests, refactors, etc.) when the user hadn't asked for that. The user said "no" and pivoted to demonstrating the actual tool in use, revealing the bootstrapping problem — a more interesting and higher-priority issue than the test gaps.

**Why:** The test gaps were real findings, but the user was exploring the product's behavior and user experience, not asking for a code maintenance backlog.

**How to apply:** After an audit, ask what the user wants to do with the findings before prescribing fixes. Don't assume "audit" means "give me a fix list." Sometimes the most valuable output is understanding failure modes, not patching test coverage.

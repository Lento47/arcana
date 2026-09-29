---
tags: [markdown, bug, gfm]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# naive backtick parity count

Simple c%2 backtick count fails for GFM double-backtick and escaped backticks

**Why:** `isInsideInlineCode` counting every '`' flips parity incorrectly for `` ``code with ` inside`` `` and `\`` escapes. **How to apply:** Scan for escaped backticks to skip, track open delimiter run-length, and close only on matching length; verify with GFM inline-code spec cases.

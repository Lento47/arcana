---
tags: [metaTrader5, python, bug-fix]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# mt5 comment length bug

MT5 binding rejects comments with ≥30 characters; truncate to 29 chars.

**Why:** MT5 Python binding has a character limit for order comments, causing execution failures if exceeded.
**How to apply:** In `mt5_execution.py`, truncate comments to `[:29]` instead of `[:31]` to avoid rejections.

Related: [[mt5-comment-length-limit]] [[max-open-positions-flip-bug]]

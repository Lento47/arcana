---
tags: [metatrader5, bug, execution]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# mt5 python binding comment limit

MT5 Python binding rejects order comments ≥30 characters

The MetaTrader5 Python binding returns `order_check failed: (-2, 'Invalid "comment" argument')` when the comment field is 30 or more characters. This is undocumented in the binding but enforced at the API level.

**Why:** The MT5 API has a hard 29-char limit on order comments (including null terminator). A slice of `[:31]` can still produce 30-char strings, which silently fail.

**How to apply:** Always slice order comments to `[:29]` in `mt5_execution.py`. If you see `Invalid "comment" argument` errors, check comment length first.

Related: [[mt5-comment-length-limit-29-chars]] [[mt5-terminal-locking-on-restart]] [[mt5-comment-length-limit]] [[domain-verification-catch-22]]

---
tags: [metatrader5, python, bug-fix, api-quirk]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# mt5 python binding comment length limit

MetaTrader5 Python binding rejects order comments ≥30 characters with a misleading error

When using the MetaTrader5 Python package on Windows, the `order_check` function silently rejects orders where the comment field is 30+ characters long. The error returned is `(-2, 'Invalid "comment" argument')`, which is misleading — it suggests the comment content is invalid, not its length.

**Why:** The underlying MT5 API likely reserves 1–2 bytes for a null terminator or length prefix in a fixed 32-byte buffer. Code that slices to `[:31]` will still fail.

**How to apply:** Always truncate order comments to `[:29]` or fewer characters. If you see `Invalid "comment" argument` errors, check length before content. This applies in `mt5_execution.py` and anywhere comments are passed to `order_send` or `order_check`.

Related: [[mt5-python-binding-comment-limit]] [[mt5-comment-length-limit-29-chars]] [[mt5-terminal-locking-on-restart]] [[mt5-comment-length-bug]] [[max-open-positions-flip-bug]] [[mt5-comment-length-limit]]

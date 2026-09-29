---
tags: [metatrader5, bug, execution]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# mt5 comment max 29 chars

MetaTrader5 Python binding rejects order comments ≥30 characters

**Why:** The MT5 Python binding's `order_check` fails with `(-2, 'Invalid "comment" argument')` when the comment field is 30+ characters. The code was slicing to `[:31]` which allows 31 characters.

**How to apply:** In `mt5_execution.py`, slice order comments to `[:29]` max (safe buffer under the 30-char hard limit). This was the root cause of demo trade rejections that appeared as generic check failures.

Related: [[mt5-comment-length-limit]] [[full-authority-chain-demo-trading]] [[mt5-comment-length-bug]] [[mt5-python-binding-comment-length-limit]] [[mt5-python-binding-comment-limit]] [[mt5-comment-length-limit-29-chars]] [[mt5-terminal-locking-on-restart]] [[domain-verification-catch-22]]

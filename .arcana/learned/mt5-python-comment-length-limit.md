---
tags: [metatrader5, python, bug-fix, trading]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# mt5 python comment length limit

MT5 Python binding rejects order comments ≥30 characters with a misleading error

**Why:** The MetaTrader5 Python binding silently enforces a 29-character limit on the `comment` field of trade requests. The error returned is `(-2, 'Invalid "comment" argument')` which does **not** indicate a length problem — it looks like a schema/argument error.

**How to apply:** Always truncate order comments to `[:29]` before passing to `order_send()`. If you see `Invalid "comment" argument`, check length first. The previous slice was `[:31]` which exceeded the limit.

Related: [[mt5-comment-length-limit]] [[risk-py-max-open-positions-flip]] [[missing-take-profit-initially]] [[mt5-comment-max-29-chars]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[full-authority-chain-demo-trading]] [[mt5-comment-length-bug]] [[risk-management-position-flip-bug]] [[mt5-python-binding-comment-length-limit]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[mt5-python-binding-comment-limit]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[mt5-comment-length-limit-29-chars]] [[mt5-terminal-locking-on-restart]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]]

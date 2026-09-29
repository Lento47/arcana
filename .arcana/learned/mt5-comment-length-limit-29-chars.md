---
tags: [metatrader5, python, bugfix, freeconomics]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# mt5 comment length limit 29 chars

MetaTrader5 Python binding silently rejects order comments ≥30 characters; truncate to [:29]

The MT5 Python binding has a hard limit on the `comment` field of 29 characters (not 30). Using `[:31]` caused order send failures. Changed to `[:29]` in `mt5_execution.py:634`.

**Why:** The MT5 binding returns an error or drops the order silently when comment length hits 30+. The actual limit is stricter than you'd expect from the docs.

**How to apply:** Always truncate order comments to `[:29]` when using `mt5.order_send()` in Python. If you need to encode metadata in the comment, keep it short.

Related: [[mt5-comment-length-bug]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[mt5-comment-length-limit]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]]

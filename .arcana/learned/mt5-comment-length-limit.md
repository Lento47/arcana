---
tags: [metatrader5, bug-fix, freeconomics]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# mt5 comment length limit

MetaTrader5 rejects trade comments at 30+ characters; truncate to 29

In `mt5_execution.py:634`, the comment field was sliced with `[:31]` but MT5 silently rejects comments ≥30 characters.

**Why:** MT5's comment field has a 29-char effective limit. Exceeding it causes order rejection with no clear error message.

**How to apply:** Always truncate trade comments to `[:29]` when sending orders to MT5.

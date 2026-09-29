---
tags: [metatrader5, python, trading-api]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# metatrader5 comment length limit

MetaTrader5 Python API rejects order comments with 30 or more characters.

When placing orders via MetaTrader5's Python binding, the comment field must be less than 30 characters. Slicing to 31 characters led to an 'Invalid comment' error. **Why:** MT5 has a hard limit on comment length for order tracking. **How to apply:** Ensure order comments are truncated to ≤29 characters before submission.

Related: [[mt5-python-binding-comment-limit]] [[mt5-comment-length-limit]] [[risk-max-open-positions-flip-bug]] [[mt5-python-comment-length-limit]] [[risk-py-max-open-positions-flip]] [[mt5-comment-max-29-chars]] [[full-authority-chain-demo-trading]] [[mt5-comment-length-bug]] [[risk-management-position-flip-bug]] [[mt5-python-binding-comment-length-limit]] [[mt5-comment-length-limit-29-chars]] [[mt5-terminal-locking-on-restart]] [[max-open-positions-flip-bug]]

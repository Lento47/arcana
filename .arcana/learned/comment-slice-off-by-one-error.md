---
tags: [metatrader5, python, off-by-one-error]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# comment slice off by one error

Sliced order comment to 31 chars instead of 29, causing MT5 rejection.

The code attempted to limit comment length by slicing to 31 characters, but MT5 requires comments to be under 30 characters, leading to a binding error. **Why:** Off-by-one error in string slicing. **How to apply:** When handling API limits, ensure correct character count; for MT5 comments, use [:29] to guarantee <30 chars.

Related: [[mt5-python-binding-comment-limit]] [[mt5-comment-length-limit]] [[risk-max-open-positions-flip-bug]] [[mt5-python-comment-length-limit]] [[risk-py-max-open-positions-flip]] [[mt5-comment-max-29-chars]] [[full-authority-chain-demo-trading]] [[mt5-comment-length-bug]] [[risk-management-position-flip-bug]] [[mt5-python-binding-comment-length-limit]] [[mt5-comment-length-limit-29-chars]] [[mt5-terminal-locking-on-restart]] [[max-open-positions-flip-bug]]

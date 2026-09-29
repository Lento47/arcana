---
tags: [error, metatrader5, string-handling]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# order comment slicing error

Incorrectly slicing order comment to 31 characters caused MT5 binding rejection.

The code had `[:31]` for the comment, but MT5 requires <30 chars, so it was changed to `[:29]`. **Why:** The MT5 Python binding has a strict character limit, and the slice was one character too long. **How to apply:** Always verify API limits for string lengths and adjust slicing accordingly to prevent binding errors.

Related: [[metatrader5-comment-length-limit]] [[comment-slice-off-by-one-error]] [[mt5-python-binding-comment-limit]] [[mt5-comment-length-limit]] [[mt5-python-comment-length-limit]] [[missing-take-profit-initially]] [[mt5-comment-max-29-chars]] [[full-authority-chain-demo-trading]] [[mt5-comment-length-bug]] [[mt5-python-binding-comment-length-limit]] [[mt5-comment-length-limit-29-chars]] [[mt5-terminal-locking-on-restart]] [[goal-check-workspace-mismatch]]

---
tags: [risk-management, bug-fix, freeconomics]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# max open positions flip bug

max_open_positions must allow position flips, not just count against cap

In `risk.py:75`, the `max_open_positions` check was blocking position flips (e.g., SELL→BUY on same symbol) because it counted the new position without accounting for the closing one.

**Why:** A flip closes one position and opens another simultaneously. Counting both against the cap incorrectly blocks valid reversals.

**How to apply:** When checking max positions, either decrement the count for positions being closed, or explicitly allow flips on the same symbol.

---
tags: [forex, market-hours, freeconomics]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# session guard market hours

Session guard blocks forex trades outside market hours (open 07:00 UTC Mon - close ~22:00 UTC Fri)

The `live_cci_loop.py` has a session guard that blocks trade execution when the forex market is closed (weekends, after ~22:00 UTC Friday).

**Why:** Forex market closes Friday evening and reopens Sunday evening/Monday morning (07:00 UTC). Signals detected during closed hours are valid for the next open.

**How to apply:** When testing trend signals outside market hours, expect the session guard to block execution. The signal detection still works—it just won't place orders until the market opens.

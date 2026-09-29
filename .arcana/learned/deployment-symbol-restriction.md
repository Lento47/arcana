---
tags: [deployment, configuration, freeconomics]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# deployment symbol restriction

Deployment authority restricts which symbols can be traded; expanding requires authority update

The current deployment (`DEP-c0b38377...`) only allows EURUSD trading. Detected trend signals for 8 other symbols couldn't be traded.

**Why:** The deployment authority configuration explicitly limits allowed symbols, likely for risk control during initial rollout.

**How to apply:** Before attempting to trade new symbols, update the deployment authority to include them. Don't assume all detected signals are tradeable.

Related: [[per-domain-fetch-headers-implementation]] [[goal-check-workspace-mismatch]]

---
code: ARC_PROVIDER_BALANCE
type: quota
http: 502
retryable: true
tags: [arcana, errors, provider, aihubmix]
updated: 2026-07-20
---

# ARC_PROVIDER_BALANCE

## User sees

> An upstream route is out of capacity. Arcana tried alternate routes when possible.

## Internal meaning

**Not** the user's Arcana credit ledger. Vendor key (e.g. Aihubmix) returned insufficient balance / recharge.

## Map signals

- `recharge your account`
- `account balance is insufficient`
- Aihubmix api error types

## Operator checklist

1. Distinguish from [[ARC_CREDITS_EXHAUSTED]] (user ledger)
2. Confirm OpenRouter failover fired
3. Recharge Aihubmix or demote it in `provider:priority` KV

## Related

- [[ARC_CREDITS_EXHAUSTED]]
- [[ARC_ALL_PROVIDERS_FAILED]]

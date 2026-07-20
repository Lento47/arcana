---
code: ARC_CREDITS_EXHAUSTED
type: quota
http: 402
retryable: false
tags: [arcana, errors, billing]
updated: 2026-07-20
---

# ARC_CREDITS_EXHAUSTED

## User sees

> No Arcana credits remaining for this account.

## Internal meaning

Arcana proxy pre-deduct / balance check failed (`insufficient_balance`).

## Map signals

- HTTP 402
- `error: insufficient_balance`
- body fields `balance`, `required`

## Operator checklist

1. Check `balance:{userId}` in ARCANA_PROXY KV
2. User path: `arcana proxy buy` / workspace billing
3. Do not confuse with [[ARC_PROVIDER_BALANCE]]

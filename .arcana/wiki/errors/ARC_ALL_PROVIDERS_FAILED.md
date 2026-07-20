---
code: ARC_ALL_PROVIDERS_FAILED
type: provider
http: 502
retryable: true
tags: [arcana, errors, provider, failover]
updated: 2026-07-20
---

# ARC_ALL_PROVIDERS_FAILED

## User sees

> All available model routes failed for this request.

## Internal meaning

Failover list exhausted. Inspect `internal.providersAttempted` and last upstream message.

## Related

- [[ARC_MODEL_UNSUPPORTED]]
- [[ARC_PROVIDER_BALANCE]]
- [[ARC_PROVIDER_UNAVAILABLE]]

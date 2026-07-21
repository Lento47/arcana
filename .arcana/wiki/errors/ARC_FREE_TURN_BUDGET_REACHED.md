---
code: ARC_FREE_TURN_BUDGET_REACHED
type: quota
http: 429
retryable: true
tags: [arcana, errors, free, quota, turn, retry]
updated: 2026-07-20
---

# ARC_FREE_TURN_BUDGET_REACHED

Fired when a free-tier user retries the same logical turn too many times
within the proxy's internal failover loop. Each `turnKey` in the record's
`reservations` map is allowed up to `FREE_TURN_PROVIDER_CALL_LIMIT` (2)
provider attempts; on the third, this code is returned.

## Trigger chain

1. `reserveFreeTurn` in `arcana-proxy/src/index.ts:680` reads the
   per-user KV record.
2. The proxy computes `turnKey = sha256("turn:" + freeTurnId(request, body)).slice(0, 40)`.
3. If `record.reservations[turnKey]` exists AND
   `existing.providerCalls >= FREE_TURN_PROVIDER_CALL_LIMIT`, return
   `free_turn_budget_reached`.
4. The route handler remaps to `ARC_FREE_TURN_BUDGET_REACHED` (line ~1419,
   `proxyOpenRouter` path; line ~1945, `proxyWithFailover` path).

## Turn-id fallback chain

The proxy derives the turn id in this order (`freeTurnId`,
`arcana-proxy/src/index.ts:619-626`):

1. `x-arcana-turn-id` header
2. `x-arcana-turn` header
3. `x-arcana-request` header
4. `body.metadata.turn_id`
5. `body.turn_id`
6. **`crypto.randomUUID()`** — fresh per request, so each retry gets a
   new turn key unless the client supplies a header

When the TUI/engine doesn't supply a turn id, every retry is a fresh
admission (NOT a turn-budget reject). The turn-budget reject only fires
when a client explicitly supplies the same turn id across retries — which
the engine does for internal `providerCalls` within one logical chat
completion.

## User-facing copy

> "This free turn couldn't reach a stable provider after 2 tries. Try
> again or pick a different model."

## Recovery

- Retry (the error is `retryable: true`)
- Switch to a free model that isn't saturated

## Related

- [[ARC_FREE_EXHAUSTED]]
- [[ARC_FREE_SESSION_EXPIRED]]
- [[ARC_FREE_CONVERSATION_MISMATCH]]

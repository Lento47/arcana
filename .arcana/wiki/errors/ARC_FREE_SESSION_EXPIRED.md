---
code: ARC_FREE_SESSION_EXPIRED
type: quota
http: 429
retryable: false
tags: [arcana, errors, free, quota, session, expiry]
updated: 2026-07-20
---

# ARC_FREE_SESSION_EXPIRED

Fired when a free-tier user's 60-minute session window has elapsed. The
record persists for the 7-day `resetAt` cooldown, so every subsequent
chat in that window hits this branch.

## Trigger chain

1. `reserveFreeTurn` in `arcana-proxy/src/index.ts:680` reads the
   per-user KV record and computes `now`.
2. If `now >= record.expiresAt`, return `free_session_expired`.
3. The route handler remaps to `ARC_FREE_SESSION_EXPIRED` (line ~1419,
   `proxyOpenRouter` path; line ~1945, `proxyWithFailover` path).

## Constants

- `FREE_SESSION_DURATION_MS = 60 * 60 * 1000` (60 minutes) — `arcana-proxy/src/index.ts:518`
- `FREE_SESSION_RESET_MS = 7 * 24 * 60 * 60 * 1000` (7 days) — same file

## User-facing copy

> "Your 60-minute free session has ended. Start a new one or upgrade for
> unlimited access."

## Recovery

- Wait until next week's reset (the record's `resetAt` field)
- Upgrade to Pro for unlimited sessions

## Observability

Response headers on every free-tier chat carry the live state:

- `X-Arcana-Free-State`: `eligible` | `active` | `expired`
- `X-Arcana-Free-Used`: turnsUsed
- `X-Arcana-Free-Remaining`: turnsRemaining
- `X-Arcana-Free-Reset-At`: ISO timestamp of the 7-day reset boundary

The full snapshot is also available at `GET /v1/free/usage` (alias for
`/v1/free-usage/sessions/current`).

## Related

- [[ARC_FREE_EXHAUSTED]]
- [[ARC_FREE_CONVERSATION_MISMATCH]]
- [[ARC_FREE_TURN_BUDGET_REACHED]]

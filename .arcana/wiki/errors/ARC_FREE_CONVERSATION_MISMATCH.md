---
code: ARC_FREE_CONVERSATION_MISMATCH
type: quota
http: 429
retryable: false
tags: [arcana, errors, free, quota, conversation]
updated: 2026-07-20
---

# ARC_FREE_CONVERSATION_MISMATCH

Fired when a free-tier user's KV record (`free_usage:<sha256>`) was created
under one conversation key and a subsequent request uses a different
conversation key. The free-usage record is bound to a single conversation
per 60-minute window so that token spend can't be shared across parallel
chats.

## Trigger chain

1. `reserveFreeTurn` in `arcana-proxy/src/index.ts:680` reads the
   per-user KV record.
2. The proxy derives `sessionKey = sha256("session:" + freeConversationId(request, body)).slice(0, 40)`.
3. If `record.arcanaSessionKey !== sessionKey`, return
   `free_session_conversation_mismatch`.
4. The route handler remaps to `ARC_FREE_CONVERSATION_MISMATCH` (line ~1419,
   `proxyOpenRouter` path; line ~1945, `proxyWithFailover` path).

## Conversation-key fallback chain

The proxy derives the conversation id in this order (`freeConversationId`,
`arcana-proxy/src/index.ts:628-650`):

1. `x-arcana-session-id` header
2. `x-arcana-session` header
3. `body.metadata.arcana_session_id`
4. `body.metadata.session_id`
5. `body.session_id`
6. `body.user`
7. `body.metadata.user_id`
8. **`hashConversationFallback(body)`** — sha256 of
   `{ last-2 messages, model, tool names }`

The last fallback replaced a literal `"default"` (fixed 2026-07-20) that
caused every client without a session header to collide on the same
session key, producing false-positive conversation-mismatch rejects.

## User-facing copy

> "This free session is bound to a different conversation. Start a new chat
> to continue."

## Recovery

- Open a new conversation
- Upgrade to Pro for concurrent sessions

## Related

- [[ARC_FREE_EXHAUSTED]]
- [[ARC_FREE_SESSION_EXPIRED]]
- [[ARC_FREE_TURN_BUDGET_REACHED]]

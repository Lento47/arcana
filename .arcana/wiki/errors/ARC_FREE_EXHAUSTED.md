---
code: ARC_FREE_EXHAUSTED
type: quota
http: 429
retryable: false
tags: [arcana, errors, free, quota, legacy]
updated: 2026-07-20
---

# ARC_FREE_EXHAUSTED

**Legacy backstop only.** In v0.3.15 this code is reserved for free-tier
rejects that arrive without one of the specific new codes below. New proxy
emissions should use the more specific codes:

- [[ARC_FREE_SESSION_EXPIRED]] — 60-minute window elapsed
- [[ARC_FREE_CONVERSATION_MISMATCH]] — different conversation, KV record bind
- [[ARC_FREE_TURN_BUDGET_REACHED]] — internal 2-call cap hit

The previous wording ("10 turns, 60m window, or 200k weekly token aggregate")
is stale; only the 60-minute session window is a hard cap. Turns and tokens
are soft display counters — the real reject comes from the specific codes
above.

## Related

- [[ARC_FREE_SESSION_EXPIRED]]
- [[ARC_FREE_CONVERSATION_MISMATCH]]
- [[ARC_FREE_TURN_BUDGET_REACHED]]
- [[ARC_FREE_MODEL_ONLY]]
- [[ARC_QUOTA_DAILY]]

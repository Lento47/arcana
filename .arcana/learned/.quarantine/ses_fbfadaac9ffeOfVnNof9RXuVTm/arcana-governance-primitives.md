---
tags: [arcana, governance, security]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana governance primitives

Arcana governance uses capabilities, approvals, PEP/PDP, ghost preview with core invariant ¬Authorized⇒¬Executed

Arcana's governance model: Capabilities (durable, exact, revocable, use-limited, ancestry-tracked), Approvals (exact-hash, single-use, expiring, crash-recoverable), Delegation (zero ambient authority, `Authority(child) ⪯ Authority(parent)`), PEP/PDP patterns, and ghost preview (risk/confidence labels before execution). Core invariant: `¬Authorized(q) ⇒ ¬Executed(q)`.

**Why:** These primitives define the security boundary for autonomous agents and are the foundation for any governance work.

**How to apply:** When building or testing agent features, model permissions as capabilities + approvals and always render via ghost preview before execution.

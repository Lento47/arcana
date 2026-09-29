---
tags: [arcana, governance, security]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana governance model

Arcana runtime enforces ¬Authorized(q)⇒¬Executed(q) via capabilities, approvals, PEP/PDP, ghost preview.

Arcana is a governed autonomy runtime. Core invariant: if not authorized, not executed. Governance uses PEP/PDP patterns: capabilities (durable, exact, revocable, use-limited, ancestry-tracked), approvals (exact hash, single-use, expiring, crash-recoverable), delegation with zero ambient authority (Authority(child) ⪯ Authority(parent)), and ghost preview rendering proposed actions with risk/confidence labels.

**Why:** This model prevents unauthorized AI agent actions and provides explainability/attestation for cybersecurity.

**How to apply:** When working on Arcana features, respect these primitives; design tests or integrations around capability/approval flows and always render ghost preview for proposed actions.

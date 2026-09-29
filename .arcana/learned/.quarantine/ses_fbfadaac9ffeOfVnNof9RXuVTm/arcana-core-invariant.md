---
tags: [arcana, governance, security]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana core invariant

Arcana is a governed autonomy runtime with core invariant ¬Authorized(q) ⇒ ¬Executed(q)

Arcana is a governed autonomy runtime with session execution security, operator console (TUI), and proof systems for autonomous agents. Core invariant: `¬Authorized(q) ⇒ ¬Executed(q)` (if not authorized, does not execute).

**Why:** This invariant is the foundational security guarantee of the entire system — all governance, capabilities, and proofs exist to enforce it.

**How to apply:** When discussing or testing Arcana components, verify every execution path respects this invariant. Any feature that executes without authorization is a critical defect.

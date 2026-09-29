---
tags: [arcana, architecture, security, governance]
date: 2026-09-01
source: ses_fa52c980affeoUPY2HdsfJ8A2o
---
# arcana core identity

Arcana is a governed autonomy runtime with an execution-security kernel, TUI console, and proof system

Arcana is an execution-security kernel, operator console (TUI), and proof system for autonomous agents. The model proposes. The engine decides. The proof records.

**Why:** The core invariant is `¬Authorized(q) ⇒ ¬Executed(q)` — no action executes without explicit authorization. This is the architectural backbone that separates arcana from simple agent scaffolding tools.

**How to apply:** When thinking about arcana's architecture, always frame it as a three-role pipeline: Proposer → Decider → Recorder. Any new package or feature should map to one of these roles.

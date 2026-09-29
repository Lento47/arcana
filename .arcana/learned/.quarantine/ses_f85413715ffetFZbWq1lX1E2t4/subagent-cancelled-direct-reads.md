---
tags: [workflow, resilience]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# subagent cancelled direct reads

When an exploration subagent is cancelled, fall back to direct file reads instead of retrying or stalling

An exploration subagent was cancelled mid-run (no side effects, nothing changed). Recovery was immediate direct reads of the three key files needed for the grain-effect design.

**Why:** Retrying the subagent adds latency; small-scope lookups are faster inline.

**How to apply:** When a subagent dies or is cancelled, do the reads/greps directly for small scopes; only re-dispatch a subagent for genuinely large explorations.

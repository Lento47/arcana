---
tags: [arcana, trust, security]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana trust model

~/.arcana (or $ARCANA_HOME) is always trusted as user-scoped config dir; no 'arcana trust' needed

Arcana's workspace trust model has two buckets. `isUserScopedConfigDir` (packages/core/src/workspace/trust.ts:283) returns true for anything under `~/.arcana` (or `$ARCANA_HOME`) — always trusted, no `arcana trust` command needed. Other workspace dirs require explicit trust.

**Why:** User asked 'What folders do you trust?' — answer grounded in trust.ts implementation.

**How to apply:** When reasoning about file access security in Arcana, treat ~/.arcana as implicitly safe. Test artifacts in L:\tmp are NOT user-scoped and may need trust.

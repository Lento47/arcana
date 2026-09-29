---
tags: [arcana, trust, security]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana trust user scoped dirs

User-scoped config dirs under ~/.arcana are always trusted without `arcana trust`

**Why:** User asked what folders are trusted; read workspace-trust implementation (`packages/core/src/workspace/trust.ts`).

**How to apply:** When checking workspace trust, treat `~/.arcana` (or `$ARCANA_HOME`) as implicitly trusted; only project dirs need explicit trust command.

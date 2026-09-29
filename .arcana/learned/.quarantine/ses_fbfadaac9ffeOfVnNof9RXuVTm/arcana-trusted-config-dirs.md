---
tags: [arcana, trust, security]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana trusted config dirs

User-scoped config dirs under ~/.arcana are always trusted without arcana trust

**Why:** isUserScopedConfigDir in packages/core/src/workspace/trust.ts returns true for ~/.arcana ($ARCANA_HOME).

**How to apply:** Treat paths under ~/.arcana as safe automatically; no need to run trust command for them.

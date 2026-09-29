---
tags: [arcana, trust, security]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana workspace trust model

User-scoped config dirs under ~/.arcana are always trusted without explicit arcana trust command

**Why:** Derived from packages/core/src/workspace/trust.ts isUserScopedConfigDir returns true for ~/.arcana ($ARCANA_HOME) paths, meaning no workspace trust prompt needed.

**How to apply:** When evaluating file operations safety, treat ~/.arcana paths as inherently trusted; focus trust checks on project directories.

---
tags: [arcana, trust, security]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# arcana workspace trust

Arcana always trusts user-scoped config dirs under ~/.arcana without explicit arcana trust.

From workspace/trust.ts, isUserScopedConfigDir returns true for paths under ~/.arcana or $ARCANA_HOME. These are trusted by default; other workspace dirs require `arcana trust` command.

**Why:** User config is inherently safe; reduces friction for legit config access.

**How to apply:** When checking trust boundaries, treat ~/.arcana as implicitly trusted; focus review on non-user-scoped paths.

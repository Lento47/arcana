---
tags: [arcana, engine, tui, reliability]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# fixing only server timeout for indefinite freeze

Server 12s bound alone cannot fix freeze that exceeds client 15s race

**Why:** If UI stays frozen >15s without error message, data already arrived and block is client rendering; server fix is necessary but not sufficient for definitive fix.

**How to apply:** Always verify fix with both layers: server bound (< client race) plus client virtualization/cap; test with large repo (>50 changed files) and confirm no indefinite block after timeouts.

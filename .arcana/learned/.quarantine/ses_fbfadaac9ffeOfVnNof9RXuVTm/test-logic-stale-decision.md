---
tags: [arcana, testing, governance]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# test logic stale decision

FM2 test used empty store (decision 'approval'), no stale 'allow' to reject; fixed by revoking capability after decision

In governance-tests.js, Failure Mode 2 (stale decision rejection) initially had PDP return 'approval' on empty store — meaning there was no stale 'allow' decision to reject, so the test was invalid. Fixed by revoking the capability AFTER the decision was cached, creating an actual stale allow that PEP must reject on fresh-context re-check.

**Why:** Test logic bug, not model bug — assistant caught it after first run attempt.

**How to apply:** When testing stale/revoked authorization, ensure the stale state actually exists (grant → decide → revoke → re-check) rather than testing on empty store.

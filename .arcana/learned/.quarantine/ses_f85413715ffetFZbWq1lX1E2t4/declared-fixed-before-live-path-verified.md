---
tags: [daemon, verification, debugging]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# declared fixed before live path verified

Answered 'yes, fixed' from commit + passing tests while the live tool path still failed via the stale daemon

Initial reply to 'did you fix it?' was 'Yes' backed by the commit and test suite, then the live re-run of the exact failing query still errored. The code was fixed but the running daemon predated the fix, so the user-visible tool was still broken.

**Why:** 'Fixed' means the live tool works, not just that code on disk is correct — a long-lived daemon makes these diverge.

**How to apply:** Before saying 'fixed', verify through the live path, or explicitly state that a daemon restart is required for the fix to take effect. When code-on-disk checks out but the live call fails, immediately suspect the stale daemon (boot time vs commit time) rather than a second bug.

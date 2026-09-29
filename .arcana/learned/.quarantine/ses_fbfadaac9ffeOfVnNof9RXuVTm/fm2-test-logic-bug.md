---
tags: [arcana, testing, mistake]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# fm2 test logic bug

Governance test for stale decision flawed; fixed by revoking capability after decision.

Test for failure mode 2 assumed initial decision 'approval' from empty store created stale allow, but none existed. Corrected by revoking capability post-decision to produce stale allow for PEP to reject.

**Why:** Logic didn't account for empty approval store meaning no prior allow.

**How to apply:** When testing stale/revocation scenarios, explicitly create state (grant then revoke) before checking rejection.

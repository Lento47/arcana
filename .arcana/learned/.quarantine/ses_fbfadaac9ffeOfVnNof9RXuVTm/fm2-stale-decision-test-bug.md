---
tags: [arcana, testing, mistake]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# fm2 stale decision test bug

Test for stale permission rejection initially had no stale allow because decision was approval with empty store

**Why:** FM2 test assumed prior 'allow' decision existed; initial PDP returned 'approval' (empty capability store) so no stale allow to reject. Fixed by revoking capability after decision to create stale allow.

**How to apply:** When testing stale/revoked permission rejection, ensure a prior positive decision exists by granting then revoking before re-check, not relying on default approval state.

---
tags: [communication, compaction, mistake]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# misread post compaction meta question

User asked why the crash topic persisted after compaction; responded about the crash itself first — user: I didn't ask that.

After compaction the user asked why the crash topic kept persisting. The initial response addressed the crash itself (cause/fix) rather than the question actually asked — why that content survived compaction — drawing `I didn't ask that`.

**Why:** `Why does X persist/appear after compaction?` is a meta-question about session state (goal tracker, summaries, injected context), not a request to re-diagnose X; answering the wrong layer forces the user to re-ask.

**How to apply:** Treat the user's literal typed message as the question — especially when injected context like a stale goal or active-focus label suggests a different topic. Answer what survived, where it lives, and why, before (or instead of) re-explaining the original issue.

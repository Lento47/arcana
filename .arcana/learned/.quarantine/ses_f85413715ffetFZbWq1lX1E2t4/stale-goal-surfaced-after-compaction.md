---
tags: [spine-tui, session-management, goals, compaction]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# stale goal surfaced after compaction

Left a blocked goal open; it survived compaction (goal tracker ≠ transcript) and surfaced as active focus, making the user think the crash was still ongoing

The goal tracker is session state **separate from the message transcript** — compaction summarizes messages but does not clear goals. A goal set at session start ("Fix TUI crash by adding optional chaining guards…", status `blocked`) was never closed, so it survived compaction and was presented as active focus. The user was confused and annoyed: "why is the crash thing persist after compaction?" The crash was already dead (root cause: duplicate `const sdk = useSDK()` in `packages/tui/src/context/project.tsx` → Bun parser fatal; fixed in commit `494f7c61`).

**Why:** Dangling goals corrupt post-compaction continuity — the compacted context shows them as current work, misrepresenting state to the user and derailing the actual active workstream.

**How to apply:** Close or mark-superseded any goal when its workstream is abandoned or blocked on a pending decision. On context switch or after compaction, update the stale goal record before continuing (this was done: goal updated, then a fresh goal created on user request).

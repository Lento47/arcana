---
tags: [arcana, debugging, tui, root-cause]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# guards shipped before reading crash log

Added 7 optional-chaining guards for sync.data accesses on an unverified theory — the real crash was a duplicate sdk identifier in project.tsx

The TUI crash was theorized as unguarded `sync.data.session/message/part` reads, and seven optional-chaining guards were added across `use-spine-projection.ts` (lines 107, 117, 128, 147, 195, 235, 260), with three more planned in `spine-entry.tsx`, before any crash log was read. The store initializes all collections synchronously, contradicting the theory; the daemon log showed a parse-error crash (duplicate `const sdk`).

**Why:** Guards derived from a plausible-sounding theory mask the real cause and add dead defensiveness, while the actual crash evidence sat in `%TEMP%\arcana-daemon.log` one read away.

**How to apply:** For any crash, read the durable logs and reconcile the hypothesis with actual state initialization *before* writing defensive guards.

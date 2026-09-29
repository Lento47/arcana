---
tags: [arcana, tui, debugging, process]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# guards added before verifying crash cause

Added 7 optional-chaining guards to sync.data accesses assuming they caused the boot crash; the real cause was a duplicate sdk declaration parse error

The session opened believing unguarded `sync.data.*` reads in `use-spine-projection.ts` (lines 107, 117, 128, 147, 195, 235, 260) and `spine-entry.tsx` (1028, 1031, 1048) crashed the TUI at boot, and guards were added on that assumption. Evidence in `%TEMP%\arcana-daemon.log` later showed the actual crash was `Identifier 'sdk' has already been declared` in `project.tsx` — a parse error at module load — and the store initializes `sync.data` collections synchronously, so the unguarded reads could not have been the boot-crash vector.

**Why:** Patching from an inferred cause (unguarded reads look suspicious) without the crash record wastes effort and obscures the real failure; parse errors kill the module graph before any runtime access happens.

**How to apply:** On any crash, pull the actual error from the durable log (`%TEMP%\arcana-daemon.log`) and confirm the failing lifecycle stage (module load vs runtime) before writing guards or fixes.

---
tags: [effect, process, pattern]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# effect timeout propagates to child kill

Use Effect.timeoutOrElse at higher level to kill spawned child via scope finalizer

**Why:** `AppProcess.run` (process.ts:157) wires `Effect.timeoutOrElse` → scope cleanup → child killed. Bounding at `Vcs.diff`/`diffRaw` with `Effect.timeoutOrElse({ duration: 12s, orElse: die })` interrupts fiber, triggering scoped spawn finalizer that kills hung git child, returning clean error instead of hanging.

**How to apply:** When needing to bound external process calls in Effect, wrap the calling effect with `timeoutOrElse` rather than adding custom kill logic; ensure underlying process uses scoped finalizer for child termination.

Related: [[arcana-tech-stack]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]]

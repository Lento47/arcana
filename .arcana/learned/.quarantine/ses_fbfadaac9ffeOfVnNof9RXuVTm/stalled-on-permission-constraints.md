---
tags: [arcana, tooling, mistake]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# stalled on permission constraints

Assistant stalled on tool constraints instead of setting goal/asking permissions

Initial attempt to create test in `L:\tmp` failed with bash tool permission/activation constraint. Assistant gave verbal-only demo instead of setting a goal to unlock tools. User corrected: 'Why don't you ask for permissions?'

**Why:** Stalling wastes turns and ignores available unlock mechanism (goal-setting).

**How to apply:** On first constraint error for a multi-step task, set goal immediately. Don't produce conceptual-only output when real execution is possible post-unlock.

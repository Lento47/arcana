---
tags: [arcana, tooling, workflow]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# goal unlocks tools

When bash/tools constrained by activation, set a goal first to unlock multi-step task tools

The assistant initially hit 'tool permission constraints' / 'activation constraint' on bash when user asked to run tests in L:\tmp. After user asked 'Why don't you ask for permissions?', assistant set a goal and tools unlocked for multi-step task.

**Why:** Multi-step file creation + execution requires goal-set to pass activation gates.

**How to apply:** If a tool call fails with permission/activation constraint on a multi-step task, set a goal (or request permission) before retrying the sequence.

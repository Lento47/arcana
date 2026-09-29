---
tags: [mistake, tooling]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# goal check repo harness timeout

goal_check 'test' invoked repo full test harness timing out at 120s; direct node run already passed.

After local suite passed 30/30, a goal_check named 'test' triggered repo-level test command that timed out. Should not rely on repo harness for verification of temp suite.

**Why:** goal_check mapped to broad repo test task incompatible with isolated temp files.

**How to apply:** Use direct runtime execution for temp test files; avoid generic goal_check that triggers unrelated heavy suites.

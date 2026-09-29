---
tags: [mistake, tooling]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# bash attempt without goal

Assistant tried bash in L:\tmp but hit permission constraint before setting goal.

First attempt to create test files via bash failed due to activation constraint; assistant tried alternate verbal approach. User asked why not ask permissions; assistant then set goal and succeeded.

**Why:** Tools required goal context not yet set; premature attempt wasted turn.

**How to apply:** Before file/system operations in constrained env, set goal or request permission proactively.

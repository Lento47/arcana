---
tags: [tooling, workflow, pattern]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# set goal to unlock tools

When tool permissions constrained, set explicit goal to unlock multi-step task tools.

Assistant initially hit bash limitation; after user prompt, set goal which unlocked tools to create files and run node.

**Why:** Environment requires goal context for certain tool activations; silent attempts fail.

**How to apply:** If a tool returns activation constraint, call goal_set with clear objective before retrying, rather than switching to verbal only.

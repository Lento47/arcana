---
tags: [arcana, tooling, mistake]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# did not ask for permissions

Assistant attempted verbal workaround instead of asking for tool permissions when blocked

**Why:** Bash tool had activation constraint; assistant tried alternative verbal demonstration, user corrected: 'Why don't you ask for permissions?'

**How to apply:** When a tool permission constraint or activation limit blocks a multi-step task, explicitly request permissions / set a goal to unlock tools rather than substituting with non-execution.

---
tags: [workflow, permissions, mistake]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# tool use without goal permission

Attempted tool use (bash) before setting goal/requesting permissions, hit constraints

**Why:** User asked to run tests; assistant tried bash but tool limited due to activation constraint; user corrected 'Why don't you ask for permissions?'.

**How to apply:** Before multi-step tasks requiring tools, set a goal / request necessary permissions first to unlock tools.

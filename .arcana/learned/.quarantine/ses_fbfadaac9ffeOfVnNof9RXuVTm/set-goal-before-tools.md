---
tags: [arcana, tooling, mistake]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# set goal before tools

Assistant hit tool permission constraints by not setting goal first

**Why:** User requested tests in L:\tmp; assistant attempted bash but faced activation constraint because no goal/permission set. User corrected: 'Why don't you ask for permissions?'

**How to apply:** For multi-step tasks requiring tools, set a goal / request permissions explicitly before tool use.

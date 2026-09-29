---
tags: [windows, powershell, env]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# l drive is local volume

L: drive on Windows is local FileSystem, not network (git fast)

**Why:** `Get-PSDrive L` showed empty `DisplayRoot` and `FileSystem` provider; `git status` 37.7ms, `git diff` 32.8ms on `L:\`, disproving network-drive latency theory for /diff hang.

**How to apply:** Don't assume L: is a network drive in this environment; baseline git performance locally before theorizing remote latency.

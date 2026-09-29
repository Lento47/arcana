---
tags: [environment, powershell, shell]
date: 2026-08-27
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# env shell is powershell

Agent shell is PowerShell, not bash; UNIX syntax breaks

The bash tool runs in a PowerShell environment, not bash/sh.

**Why:** Assistant used `for` loops and `>` redirects; commands broke immediately.

**How to apply:** Write PowerShell-compatible syntax (e.g., `Get-ChildItem`, `| Out-File` or native cmdlets) instead of bash constructs.

Related: [[powershell-shell-constraints]] [[powershell-constraints-arcana]] [[powershell-rg-search]] [[arcana-powershell-not-bash]] [[arcana-shell-is-powershell]] [[arcana-bash-tool-gated]] [[powershell-environment]] [[network-drive-theory-wrong]] [[l-drive-is-local-volume]]

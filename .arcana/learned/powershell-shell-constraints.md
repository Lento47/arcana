---
tags: [environment, powershell, ripgrep]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# powershell shell constraints

Shell is PowerShell; bash loops/redirects fail, use rg + PS loops

**Why:** In Arcana environment, the shell is PowerShell not bash; `for` loops and `>` redirects cause ParserError.
**How to apply:** Use PowerShell loops and `rg` (ripgrep) for searches; avoid bash syntax unless goal_set active.

Related: [[powershell-constraints-arcana]] [[powershell-rg-search]] [[arcana-powershell-not-bash]] [[arcana-shell-is-powershell]] [[arcana-bash-tool-gated]] [[powershell-environment]] [[network-drive-theory-wrong]] [[l-drive-is-local-volume]]

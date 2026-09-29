---
tags: [powershell, search]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# powershell rg search

Use ripgrep (rg) with PowerShell loops for repo searches

**Why:** Bash for loops fail in PowerShell; rg is fast and available.

**How to apply:** In Arcana env, run `rg 'pattern' | ForEach-Object { ... }` in PowerShell.

Related: [[arcana-powershell-not-bash]] [[arcana-shell-is-powershell]] [[powershell-environment]] [[network-drive-theory-wrong]] [[l-drive-is-local-volume]] [[list-skills-by-install-count]]

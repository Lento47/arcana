---
tags: [mistake, powershell, shell]
date: 2026-08-27
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# mistake bash syntax powershell

Used bash for/redirect syntax in PowerShell shell; commands broke

Assistant wrote `for ... ; do ... done` and `>` redirects; they broke because the shell is PowerShell.

**Why:** Assumed bash; environment is actually PowerShell.

**How to apply:** Detect shell first (or assume PowerShell) and use cmdlet/PowerShell syntax for loops and redirection.

Related: [[powershell-shell-constraints]] [[powershell-constraints-arcana]] [[powershell-rg-search]] [[assistant-gave-recovery-unasked]] [[arcana-powershell-not-bash]] [[arcana-shell-is-powershell]] [[powershell-environment]] [[network-drive-theory-wrong]] [[l-drive-is-local-volume]] [[explained-block-instead-of-retrying-request]] [[licensing-contradiction-error]] [[goal-check-ran-wrong-test-suite]] [[forgot-tp-when-setting-sl]] [[forgot-tp-on-demo-positions]] [[omitted-take-profit-on-demo-positions]] [[only-set-sl-forgot-tp]] [[surface-level-assessment-error]] [[goal-check-workspace-default]]

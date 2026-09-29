---
tags: [environment, powershell, tooling]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# powershell environment

Shell is PowerShell not bash; `for`/`>` fail, use `rg` + PS loops

The working shell is PowerShell, not bash. Commands like `for` loops and `>` redirection fail. Use `rg` (ripgrep) with PowerShell loops instead.

**Why:** Attempting bash-style loops and redirection in PowerShell causes syntax errors and failed inspection commands.

**How to apply:** When running shell commands for inspection in this environment, use PowerShell-compatible syntax and prefer `rg` for searching.

Related: [[l-drive-is-local-volume]] [[fallback-on-tool-failure]] [[firecrawl-mcp-assumption]] [[goal-check-workspace-mismatch]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]

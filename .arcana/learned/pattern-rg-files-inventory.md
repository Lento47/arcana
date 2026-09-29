---
tags: [pattern, rg, monorepo]
date: 2026-08-27
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# pattern rg files inventory

Use rg --files for fast, ignore-aware file inventory in monorepos

For file/test counts in Arcana monorepo, `rg --files` is fast and skips node_modules/ignored paths.

**Why:** Naive recursive walks timed out; `rg --files` respects .gitignore and is near-instant.

**How to apply:** Prefer `rg --files` (optionally piped to `rg` patterns) over `find`/`Get-ChildItem -Recurse` for inventory tasks.

Related: [[effect-timeoutfail-kills-child-process]] [[arcana-verify-trash-untracked]] [[createresource-memo-equals]] [[effect-timeout-propagates-to-child-kill]]

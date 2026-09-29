---
tags: [mistake, performance, rg]
date: 2026-08-27
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# mistake walked node modules

Inventory command recursively walked node_modules; timed out

An accurate-count command traversed `node_modules`, causing a timeout and bad data.

**Why:** Unbounded recursive glob picked up dependency trees.

**How to apply:** Use `rg --files` (respects ignore files, skips node_modules) or scope paths explicitly; never naive-recurse a monorepo root.

Related: [[assistant-gave-recovery-unasked]] [[network-drive-theory-wrong]] [[explained-block-instead-of-retrying-request]] [[licensing-contradiction-error]] [[goal-check-ran-wrong-test-suite]] [[forgot-tp-when-setting-sl]] [[forgot-tp-on-demo-positions]] [[omitted-take-profit-on-demo-positions]] [[only-set-sl-forgot-tp]] [[surface-level-assessment-error]] [[goal-check-workspace-default]]

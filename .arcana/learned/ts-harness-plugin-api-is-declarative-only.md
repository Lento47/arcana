---
tags: [ts-harness, plugins, api-design]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# ts harness plugin api is declarative only

Plugin API 1 declares hooks but host implementation doesn't exist — plugins produce files that do nothing

The ts-harness plugin system (`Plugin API 1`) declares interfaces but the host implementation for runtime hooks is not implemented. Creating a plugin via `plugin-install` produces files with no effect. The model correctly identified this and redirected to `profile-create` as the actual mechanism for adding product support.

**Why:** Understanding the gap between declared APIs and actual implementations is critical for accurate tool guidance.

**How to apply:** When evaluating a codebase, don't trust declared interfaces alone — verify the host/runtime actually implements them. In ts-harness, product support is added through vendor profiles, not plugins.

Related: [[ts-harness-bootstrapping-deadlock]] [[ts-harness-plugin-api-unimplemented]] [[cli-override-for-bootstrapping]] [[audit-surface-level-initial-take]] [[ts-harness-audit-validation]] [[per-domain-fetch-headers-implementation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[ts-harness-grounding-gate]] [[safe-file-split-without-vcs]]

---
tags: [ts-harness, plugins, api-design, incomplete]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# ts harness plugin api unimplemented

Plugin API 1 declares plugin hooks but the host implementation has no runtime for them

In ts-harness, the `Plugin API 1` declares plugin creation and lifecycle hooks, but the host implementation doesn't actually execute plugin code. Creating a plugin produces files that do nothing at runtime. The model in the chat correctly recognized this and redirected the user from `plugin-install` to `profile-create` — which is the real mechanism for adding product support.

**Why:** Plugins were likely designed for future extensibility or user scripting, but the host-side runtime was never shipped. The chat model's system prompt is aware of this limitation.

**How to apply:** If you're building a plugin system, either ship the host runtime in the same release as the API, or clearly mark the API as `experimental` / `no-op` in documentation and tooling so users don't waste time on it.

Related: [[ts-harness-audit-validation]] [[per-domain-fetch-headers-implementation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[ts-harness-grounding-gate]] [[safe-file-split-without-vcs]]

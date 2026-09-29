---
tags: [security, policy, tools]
date: 2026-08-29
source: ses_fb4c95cb0ffeGY0chstQ3C2BMS
---
# remote search blocked

Web search and remote content fetching are blocked by DENY_REMOTE_CONTENT_INJECTION policy

**Why:** Both `websearch` and `webfetch` tools were denied by the `DENY_REMOTE_CONTENT_INJECTION` security policy, and `bash` returned system messages instead of executing. **How to apply:** Use `npm search` as a fallback for package discovery when general web search is unavailable; do not attempt remote HTTP calls in this environment.

Related: [[arcana-governance-engine]] [[denied-remote-content-injection-policy]] [[arcana-intent-binding-feature]] [[require-confirm-per-step-enforcement]] [[wholesale-replacement-guard]] [[protected-paths-non-widenable]] [[domain-verification-catch-22]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]] [[cli-override-for-bootstrapping]]

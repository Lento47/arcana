---
tags: [security-policy, environment, constraints]
date: 2026-08-29
source: ses_fb4c95cb0ffeGY0chstQ3C2BMS
---
# deny remote content injection policy

DENY_REMOTE_CONTENT_INJECTION policy blocks websearch, webfetch, and bash in this environment

**Why:** The environment enforces a strict security policy (`DENY_REMOTE_CONTENT_INJECTION`) that denies all remote content retrieval and command execution outside the controlled runtime.

**How to apply:** When researching external topics, do not attempt `websearch`, `webfetch`, or `bash`-based HTTP requests. Rely on existing repo knowledge (`SOUL.md`, `AGENTS.md`, package structure) and ask the user for external context instead.

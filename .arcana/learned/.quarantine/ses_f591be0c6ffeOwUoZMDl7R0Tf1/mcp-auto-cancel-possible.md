---
tags: [arcana, mcp, permissions, debugging]
date: 2026-09-16
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# mcp auto cancel possible

MCP connection attempts can be auto-cancelled by policy rules without showing the approval prompt to the user

Repeated MCP connect attempts returned `DENIED by operator` or were silently cancelled, but the user claimed they never saw a prompt. This suggests policy rules can pre-empt the interactive approval flow.

**Why:** Misdiagnosing auto-cancel as user denial leads to wrong troubleshooting and wasted cycles.

**How to apply:** If MCP keeps failing without visible prompt, check the policy config for pre-emptive deny rules before blaming the user. Suggest they inspect their Arcana policy config to allow the target.

---
tags: [arcana, agent-behavior, permissions, mistake]
date: 2026-09-15
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# explained block instead of retrying request

Spent multiple turns explaining why MCP was blocked instead of retrying so the user could approve in the TUI

The assistant received `DENY_REMOTE_CONTENT_INJECTION` on the Firecrawl MCP connection and responded by explaining the security model in detail across 3+ turns. The user had to explicitly say "why don't you ask for permissions?" before the assistant tried requesting again.

**Why this was wrong:** The explanation was correct but unhelpful — the user already wanted the connection to happen. The agent should have immediately retried the request to trigger the TUI approval prompt, giving the user a concrete action to take.

**How to avoid:** On any PEP block requiring user approval, the response should be: 1) One sentence explaining what's blocked, 2) Immediately retrying the request so the TUI prompt appears, 3) Telling the user to approve when prompted. Don't explain the security architecture — explain what to do.

Related: [[arcana-category-identification]] [[licensing-contradiction-error]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[goal-check-ran-wrong-test-suite]] [[forgot-tp-when-setting-sl]] [[forgot-tp-on-demo-positions]] [[omitted-take-profit-on-demo-positions]] [[only-set-sl-forgot-tp]] [[surface-level-assessment-error]] [[goal-check-workspace-default]]

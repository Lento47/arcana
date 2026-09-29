---
tags: [arcana, security, mcp, permissions]
date: 2026-09-15
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# denied remote content injection policy

MCP connections blocked by PEP DENY_REMOTE_CONTENT_INJECTION — requires explicit user approval in TUI

The Arcana security model enforces `DENY_REMOTE_CONTENT_INJECTION` at the PEP (Policy Enforcement Point) level. Any agent attempt to connect to external MCP servers (like Firecrawl) triggers this policy and cannot be bypassed by the agent.

**Why:** This prevents an agent from unilaterally connecting to external servers that could inject arbitrary instructions or data. It's the "model proposes, engine decides" principle applied to network access.

**How to apply:** When the PEP blocks an MCP connection, the agent should immediately retry the connection (not just explain the block) so the user sees the approval prompt in the TUI. The user must explicitly click Approve. To grant persistent access, add a capability in `authority.jsonl` for the specific MCP target. Agents should never assume they can self-approve network access.

Related: [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]] [[require-confirm-per-step-enforcement]] [[wholesale-replacement-guard]] [[protected-paths-non-widenable]] [[domain-verification-catch-22]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]] [[cli-override-for-bootstrapping]]

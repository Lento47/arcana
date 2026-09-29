---
tags: [arcana, agent-behavior, permissions, ux]
date: 2026-09-15
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# retry instead of explain permission blocks

When PEP blocks an action requiring user approval, immediately retry so the TUI prompt appears rather than explaining why it failed

When a permission system blocks an action that needs user approval (e.g., MCP connection), the agent's instinct is to explain the security model. But the user needs to see the actual approval prompt to act on it.

**Why:** Explaining the block is helpful context, but it doesn't unblock anything. The user can only approve when they see the TUI prompt, which only appears when the agent makes the actual request.

**How to apply:** On first block → explain briefly AND immediately retry the connection. Don't wait for the user to ask "why don't you ask for permission?" — they shouldn't have to prompt you to request access. Pattern: `brief_explanation + immediate_retry()` rather than `long_explanation + wait_for_user_direction`.

Related: [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]

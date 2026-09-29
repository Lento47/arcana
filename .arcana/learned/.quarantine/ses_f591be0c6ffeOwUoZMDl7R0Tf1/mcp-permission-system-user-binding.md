---
tags: [arcana, mcp, security, permissions]
date: 2026-09-16
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# mcp permission system user binding

MCP connections require explicit user approval via the PEP; agents cannot bypass DENY_REMOTE_CONTENT_INJECTION

The Arcana permission enforcement point (PEP) blocks all remote content injection by default. MCP connections trigger an approval prompt that the **user** must approve — the agent cannot approve on their own behalf. This is by design: agents shouldn't unilaterally connect to external servers that could inject arbitrary instructions.

**Why:** Security invariant — prevents prompt injection via external services. Same philosophy as trading bot: "model proposes, engine decides."

**How to apply:** When needing MCP access, issue the connect call so the user sees the prompt in the TUI. Don't assume auto-denial means the user actively denied. If auto-cancelled, check if earlier policy rules are pre-empting the prompt.

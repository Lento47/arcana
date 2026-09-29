---
tags: [arcana, mcp, workflow]
date: 2026-09-16
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# mcp approval flow

Issue MCP connect call so user sees TUI prompt; don't retry blindly if it fails

When an MCP connection is needed:
1. Issue the connect call once
2. Tell the user to look for the approval prompt in their TUI
3. If it fails, check whether it was user denial or auto-cancel by policy
4. Don't spam retries — it won't help and wastes cycles

**Why:** The user may never see the prompt if policy pre-empts it. Repeated retries with the same result give no new information.

**How to apply:** One attempt → explain to user → check policy if failed. Offer alternative approaches (direct HTTP API, env var config) if MCP path is blocked.

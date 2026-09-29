---
tags: [arcana, tooling, opentui]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# opentui system reminder agents injection

File read tool auto-injects nearest AGENTS.md as <system-reminder> after content

**Why:** TUI renders tool call chip "▸ ✓ read ... L14-28" and appends "Instructions from .../AGENTS.md / opencode database guide" via harness wrapper; not file content nor leak, just project rules for effect/beta.74 and PowerShell shell context.

**How to apply:** Ignore system-reminder block when reviewing file reads; treat it as framework context, not user data or file data.

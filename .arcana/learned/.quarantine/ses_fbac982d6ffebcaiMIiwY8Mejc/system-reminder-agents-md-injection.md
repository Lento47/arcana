---
tags: [arcana, tui, agents, tooling]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# system reminder agents md injection

File read tool auto-injects nearest AGENTS.md inside <system-reminder> wrapper

**Why:** TUI proof chips like `▸ ✓ read ... L14-28` plus `Instructions from .../AGENTS.md` and `opencode database guide` are not file content leakage but harness-appended context to enforce project rules.

**How to apply:** Treat `<system-reminder>...</system-reminder>` as framework-injected context; strip or collapse it in user-visible rendering while keeping it in model context for agent behavior.

---
tags: [arcana-site, tooling, permissions]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# failed to request permissions when tool constrained

Assistant described tool constraints instead of asking for permissions/setting goal to unlock tools

**Why:** User expected assistant to request permissions when tools were limited, not just report limitation. Wasted turns before correction.

**How to apply:** When a tool call fails due to activation/permission constraints, immediately request needed permissions or set a goal to unlock multi-step tool use, rather than only explaining the constraint.

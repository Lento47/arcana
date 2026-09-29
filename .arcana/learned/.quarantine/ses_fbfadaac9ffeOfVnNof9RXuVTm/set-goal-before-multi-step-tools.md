---
tags: [workflow, tools, permissions]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# set goal before multi step tools

Set a goal before multi-step tool use to unlock permissions and avoid constraint errors

**Why:** Assistant initially hit bash tool permission constraints when trying to create test files in L:\tmp; after user correction, setting a goal unlocked tools and allowed successful suite creation.

**How to apply:** For any task involving multiple file writes or command executions, explicitly set a goal (or request permissions) at start rather than after hitting limits.

---
tags: [workflow, tools, behavior]
date: 2026-08-26
source: ses_fbfadaac9ffeOfVnNof9RXuVTm
---
# set goal before multistep

Set a goal first to unlock tools for multi-step tasks

Assistant initially hit tool permission constraints on a multi-step test task; after the user asked 'why don't you ask for permissions?', setting a goal unlocked the tools and allowed execution.

**Why:** Multi-step tasks requiring tool use need an active goal to pass permission gates.

**How to apply:** Before starting any multi-step task involving tool calls, establish/set a goal to unlock permissions.

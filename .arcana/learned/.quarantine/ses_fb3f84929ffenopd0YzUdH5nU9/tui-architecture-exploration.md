---
tags: [arcana, tui, architecture, solidjs]
date: 2026-08-29
source: ses_fb3f84929ffenopd0YzUdH5nU9
---
# tui architecture exploration

The arcana TUI's architecture requires understanding routes, commands, keymaps, and dialogs before adding new features.

Before building the Gantt timeline dashboard, the assistant had to explore multiple parts of the TUI codebase: **app.tsx** for route rendering, **app-commands.tsx** for command registration, the **keymap** for key bindings, and **dialog components** for UI patterns. Key findings: routes are added to app.tsx's rendering logic, commands are registered in app-commands.tsx, keymaps are defined separately from commands, and components must have imports at the top level rather than inline.

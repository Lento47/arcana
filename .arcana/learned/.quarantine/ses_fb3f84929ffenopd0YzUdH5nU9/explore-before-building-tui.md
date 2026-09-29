---
tags: [arcana, tui, pattern, solidjs]
date: 2026-08-29
source: ses_fb3f84929ffenopd0YzUdH5nU9
---
# explore before building tui

When adding features to the arcana TUI, explore routes, commands, keymaps, and dialogs first.

The assistant discovered that successful TUI feature additions require understanding four layers: **route rendering** (app.tsx), **command registration** (app-commands.tsx), **keymap definitions**, and **dialog/component patterns**. Multiple exploration passes were needed before building, and the component itself needed imports hoisted to the top of the file. This pattern applies to any new TUI route or feature.

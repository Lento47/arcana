---
tags: [misunderstanding, tui, communication]
date: 2026-08-29
source: ses_fb3f84929ffenopd0YzUdH5nU9
---
# coded tui when chat was intended

Started building a coded SolidJS/OpenTUI route when the user wanted a chat display

**Why:** The user said "TUI" and the assistant interpreted it as "build a coded TUI dashboard" — exploring the codebase, checking routes, components, and keymaps. The user had to say "no. remove it" and clarify "here in chat TUI, not coded."

**Correction:** Always confirm the intent when a user says "TUI" — ask whether they want it rendered in chat or built as a coded integration. Default to chat rendering unless explicitly told otherwise.

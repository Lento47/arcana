---
tags: [tui, chat, preference]
date: 2026-08-29
source: ses_fb3f84929ffenopd0YzUdH5nU9
---
# tui meaning chat display

"TUI" in chat context means display directly in the chat interface, not build a coded TUI app

**Why:** The user said "TUI" and the assistant began building a coded SolidJS/OpenTUI route integration, but the user actually wanted the visualization rendered directly in the chat interface. This required explicit clarification to resolve the ambiguity.

**How to apply:** When a user says "TUI" or asks for a dashboard/visualization in TUI without specifying "coded" or "app," default to rendering it directly in the chat interface. Only build coded TUI integration when the user explicitly asks for it.

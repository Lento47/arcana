---
tags: [arcana, tui, markdown, rendering]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# markdown escaping corrupts toolcall display

Agent tool-call JSON rendered through SpineProse markdown mode gets underscores escaped (\_), corrupting the displayed command — root cause investigation was in flight

The user's TUI displayed an agent bash tool call with every underscore escaped as `\_` (`tool\_call`, `arg\_key`, `node\_modules`, `\@opentui+solid@...`). Diagnosis: the tool-call content was rendered as chat prose through SpineProse markdown mode, where `escapeMarkdownUnderscoreEmphasis` escapes underscores to prevent spurious emphasis — mangling JSON/paths that legitimately contain underscores.

**Why:** Tool-call content (JSON, file paths, code) must not pass through prose markdown escaping; it corrupts technical content the user needs to read verbatim.

**How to apply:** Tool-call display paths should bypass markdown emphasis escaping (or render as code, not prose). When reproducing, check whether agent-turn tool calls are routed through SpineProse markdown mode, and route them through a verbatim/code rendering path instead. The @qa investigation of this was still open at session end.

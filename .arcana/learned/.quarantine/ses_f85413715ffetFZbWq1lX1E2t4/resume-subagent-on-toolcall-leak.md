---
tags: [subagents, arcana, debugging]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# resume subagent on toolcall leak

When a subagent's result channel returns its tool calls instead of a final report, resume the subagent to retrieve actual findings

A QA subagent's result channel returned its raw tool calls (e.g. a quoted bash invocation) instead of a final report. The correct response is to resume the subagent so it completes and emits its actual findings, rather than interpreting the leaked tool call as the answer.

**Why:** Leaked intermediate tool calls in a result channel indicate the subagent stopped mid-investigation; treating them as findings produces garbage analysis.

**How to apply:** On seeing tool-call content in a subagent result, immediately re-invoke/resume that subagent and ask for the final report; don't reason from the partial output.

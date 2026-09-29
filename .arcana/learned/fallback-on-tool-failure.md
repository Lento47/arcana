---
tags: [tooling, robustness, agent-workflow]
date: 2026-09-16
source: ses_f5760e7faffen1UV0gKJ0iqf2b
---
# fallback on tool failure

When external tools like MCP fail, fall back to direct data fetching or pre-pulled information.

During the session, when Firecrawl MCP timed out and network access was blocked, the assistant switched to using previously gathered data to provide answers, demonstrating adaptability.

**Why:** Ensures continuity in problem-solving and avoids blocking on unavailable resources, which is crucial in dynamic environments.

**How to apply:** Implement fallback mechanisms in agent workflows: check tool availability, cache data, and have alternative methods ready, such as direct web fetches or local data sources.

Related: [[goal-check-workspace-mismatch]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]

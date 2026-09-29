---
tags: [firecrawl, mcp, api-key, configuration]
date: 2026-09-16
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# firecrawl requires api key

Firecrawl MCP needs a FIRECRAWL_API_KEY; anonymous access is blocked for suspicious IPs

Even with MCP connected, Firecrawl returns `scrape: Failed to scrape URL. You've hit the rate limit. Please try again later or use an API key.` when no API key is configured and the IP is flagged.

**Why:** Firecrawl's free tier blocks anonymous access from flagged IPs.

**How to apply:** Get a free API key from https://firecrawl.dev (1000 credits). Set `FIRECRAWL_API_KEY=fc-xxxx` as an environment variable before launching. Without it, MCP tools are connected but non-functional.

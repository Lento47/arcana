---
tags: [ai, quality-control, specificity]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# anti slop guard for ai advice

Implement anti-slop guard to catch generic advice and ensure specific, actionable output.

**Why:** Generic advice like "check the logs" is unhelpful and common in AI-generated troubleshooting. An anti-slop guard can catch such structural genericity and prompt for more specific details or refuse to give generic advice.

**How to apply:** Build a filter that detects generic phrases and either refines the query to get more specific information or marks the response as generic so it can be improved.

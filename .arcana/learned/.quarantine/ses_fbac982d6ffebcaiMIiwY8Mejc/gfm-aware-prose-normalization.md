---
tags: [markdown, pattern, tui]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# gfm aware prose normalization

Normalize chat prose with GFM inline-code awareness to avoid corrupting code spans

**Why:** Prose reflow must not alter content inside backticks, code fences, or other GFM inline elements.

**How to apply:** Parse/track inline code spans before joining lines; only inject/strip spaces outside code spans, preserving semantic line breaks per GFM.

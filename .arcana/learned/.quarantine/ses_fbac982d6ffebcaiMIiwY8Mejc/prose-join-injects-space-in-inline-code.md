---
tags: [prose, markdown, bug]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# prose join injects space in inline code

normalizeChatProse joined lines with space inside inline code breaking `read` rendering

**Why:** `normalizeChatProse`/`normalizeProseRegion` unconditionally added `" "` between lines, injecting space inside `` `read` `` span (`Hidden — `\nread`` -> `Hidden — ` read``) causing split rendering across lines.
**How to apply:** Make line-join inline-code-aware (odd backtick count check) and join without space when inside code; add regression test for inline code split across semantic line breaks.

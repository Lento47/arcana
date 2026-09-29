---
tags: [arcan, css, design, docs]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# docs page design checklist

What makes a content pane read as documentation: compact header, dominant section headings, 65-80ch measure, expanded nav

Diagnosing why a docs page "doesn't look like documentation" (arcan `src/app/docs/page.tsx`): (1) a marketing-style hero header — giant eyebrow + clamp(28-36px) title + description banner — where docs need compact headers; (2) inverted heading hierarchy — section titles rendered at 11px gray uppercase (metadata-label styling) while article titles are 20px, making sections invisible and articles read like an FAQ list; (3) body max-width 880px at 14px ≈ 100+ chars/line where docs standard is 65-80ch; (4) single-open accordion sidebar nav where real docs sidebars keep groups expanded; (5) missing "on this page" rail / anchor links.

**Why:** These are the visual grammar users expect from documentation; deviating reads as marketing or FAQ.

**How to apply:** For docs layouts: compact content header, section headings visually dominant over article titles, cap body measure to ~70ch (e.g. max-width ~720px), expand all sidebar nav groups by default (drop the `-active` inverted-label class when everything is open — uniform labels are quieter), and add per-section anchor navigation.

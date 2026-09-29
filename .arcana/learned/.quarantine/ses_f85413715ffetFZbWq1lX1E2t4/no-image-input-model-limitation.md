---
tags: [verification, ssr, debugging]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# no image input model limitation

This model cannot view screenshots — verify rendered UI via SSR HTML and served-output inspection instead

Taking a screenshot of the docs page was useless because this model has no image input. Verification fell back to text-based means: curling the dev server route and inspecting the rendered HTML — confirming all 47 articles/9 sections SSR'd, zero console errors, and the exact class/aria patterns in the served output.

**Why:** Screenshots can't be interpreted, so image-based verification silently produces no signal; text-based verification of the actual served output does.

**How to apply:** To "see" a page: `curl` the route, grep for class names, aria attributes, and element counts; check the dev server console for errors. This both verifies rendering and detects stale-serve problems (see `verify-served-output-not-source`).

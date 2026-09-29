---
tags: [tui, testing, pre-flight]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# pre edit test audit

Before editing a shared component, audit three test classes: provider-less renders, source-asserting tests, and exact-glyph/output assertions

Before editing `spine-prose.tsx`, three checks were run: (1) which tests render it without providers the change adds — adding `useKV()` requires every rendering test to include `KVProvider` (all did); (2) which tests source-assert on the file's literal source — `spine-prose-code-flicker.test.tsx` asserts `filetype={ft()}...drawUnstyledText={false}` ordering, must not be disturbed; (3) which tests assert exact glyphs/output that a cycling caret glyph could break.

**Why:** Shared TUI components have many indirect consumers; a naive edit breaks tests in non-obvious ways.

**How to apply:** Grep the test tree for the component name, classify each hit as render-test / source-assert / exact-output before writing the edit.

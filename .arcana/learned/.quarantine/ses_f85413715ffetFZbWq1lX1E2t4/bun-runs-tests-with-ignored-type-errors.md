---
tags: [arcana, bun, testing, typescript]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# bun runs tests with ignored type errors

bun executes TypeScript tests with type errors ignored — omitted required props run as undefined and silently change rendering behavior

`spine-prose-finalize.test.tsx` omitted the required `syntaxStyle: SyntaxStyle` prop. bun ignored the type error and ran `<markdown>` with `syntaxStyle` undefined, so emphasis markers like `**world**` passed through literally instead of rendering as real emphasis. In production, spine-prose always passes `style()`, so the styled render is the true final form.

**Why:** A green bun test suite can hide type-level bugs; a later type fix 'breaks' tests because behavior snaps to the correct production form.

**How to apply:** When adding a previously-missing required prop changes a test's expected output, re-derive the expectation from what production actually passes, not from previously observed (buggy) output. Satisfy the prop via existing patterns (e.g. `SyntaxStyle.fromStyles` as other tests do).

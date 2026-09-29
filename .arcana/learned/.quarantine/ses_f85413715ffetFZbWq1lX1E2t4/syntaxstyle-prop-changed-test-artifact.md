---
tags: [arcana, testing, markdown, typescript]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# syntaxstyle prop changed test artifact

Adding the previously-omitted required syntaxStyle prop changed markdown rendering — the test had asserted the unstyled, type-error-ignored artifact

`spine-prose-finalize.test.tsx` omitted the required `syntaxStyle` prop. At HEAD, bun ignored the type error and ran markdown with `syntaxStyle` undefined, so emphasis markers passed through literally. Adding `SyntaxStyle.fromStyles` made closed `**world**` render as real emphasis, consuming the markers — frame shows `hello world`, which IS the production final form (spine-prose always passes `style()`). The test failed after the 'fix' because it asserted the broken-state artifact. Correction: update the assertion to the true final form; it still discriminates because the unfinalized streaming forms (`hello **wor` / `hello wor`) never contain `hello world`.

**Why:** Satisfying a type requirement changed runtime behavior the test had pinned in its broken state.

**How to apply:** When adding previously-omitted required props to fix type errors, rerun affected tests expecting behavior changes; assert the production-true rendering while preserving discrimination against the negative case.

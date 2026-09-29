---
tags: [arcana, bun, testing, typescript]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# bun ignores type errors tests pin impossible artifacts

Bun runs despite TS type errors, letting tests pass while asserting output that never occurs in production

At HEAD, `spine-prose-finalize.test.tsx` omitted the required `syntaxStyle` prop of `MarkdownOptions` (required, no `?`). Bun ignored the type error and ran `<markdown>` with `syntaxStyle` undefined, so emphasis markers passed through literally and the assertion pinned `hello **world**`. Adding `SyntaxStyle.fromStyles` made `**world**` render as real emphasis (`hello world`) — the true production form, since spine-prose always passes `style()`.

**Why:** A green test can be green only because the runtime tolerated a type violation; the asserted state never occurs in production.

**How to apply:** When a typecheck fix makes a previously green test fail, suspect the old assertion pinned type-error-only behavior — update it to the production form while keeping the test discriminating (unfinalized streaming forms `hello **wor` / `hello wor` still never match).

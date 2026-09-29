---
tags: [arcana, testing, bun, markdown]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# test assertion encoded missing prop bug

The finalize test asserted the unstyled artifact caused by an omitted required syntaxStyle prop; adding the prop broke it until the assertion matched the true final form

At HEAD, `spine-prose-finalize.test.tsx` omitted the required `syntaxStyle` prop; bun ignored the type error and the closed `**world**` rendered with literal markers. After satisfying the prop with `SyntaxStyle.fromStyles`, the test failed because the frame now showed real emphasis. Fix: assert the production final form (`hello world`) — the unfinalized streaming forms (`hello **wor` / `hello wor`) never contain it, so the test still discriminates finalize vs. streaming.

**Why:** Assertions written against buggy behavior become load-bearing; fixing the latent bug looks like a regression.

**How to apply:** When a type fix changes test output, derive the expectation from what production actually passes (spine-prose always passes `style()`) and preserve the discriminating property of the assertion.

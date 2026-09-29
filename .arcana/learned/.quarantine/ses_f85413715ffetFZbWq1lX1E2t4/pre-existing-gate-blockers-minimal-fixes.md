---
tags: [arcana, typescript, testing]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# pre existing gate blockers minimal fixes

Pre-existing typecheck errors on HEAD in adjacent files block the root gate — verify on HEAD, then apply the smallest satisfying fix

Root typecheck was blocked by errors in untouched files: `spine-prose-finalize.test.tsx` omitted the required `syntaxStyle` prop (`MarkdownOptions` line 70 has no `?`; fixed via `SyntaxStyle.fromStyles` import matching other tests) and `resumable-fetch.test.ts` had a zero-arg fetch mock (`as unknown as typeof fetch`, tsc's own suggestion) plus a bogus null narrowing that picked the wrong `toBe` overload (`?? ""` defeats it). Both were verified pre-existing on HEAD (committed in `89e17b04`) before fixing.

**Why:** Unrelated pre-existing errors block delivery gates; minimal in-spirit fixes unblock without scope creep.

**How to apply:** Confirm the error exists on HEAD, apply the smallest type-satisfying fix, prefer tsc's suggested casts, and rerun the affected tests.

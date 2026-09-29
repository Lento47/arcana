---
tags: [arcana, tui, text-rendering, scope-note, corrected]
date: 2026-09-01
corrected: 2026-09-15
source: ses_fa5a19358ffeefMYEXA1ra590Z
---
# normalize chat prose limited kinds

normalizeChatProse collapses hard newlines for plan/ok/ask/think only — that scope is deliberate

**Why:** `normalizeChatProse` (`packages/tui/src/shell/command-spine/chat-prose.ts`) joins
accidental hard newlines between prose lines, and `SpineProse` applies it only to the `plan`, `ok`,
`ask` and `think` kinds — assistant prose keeps its newlines byte-for-byte.

The original note justified this scope by a `here's` → `here\n's` symptom and suggested extending the
normalizer to assistant prose. That symptom is **not** what the note claimed: the renderer does not
break at apostrophes (see [[mid-word-wrap-artifact]]). A literal `here\n's` is a real newline in the
text.

**How to apply:** Keep the scope. Assistant prose legitimately contains hard newlines — lists,
addresses, quoted output, anything the model laid out deliberately — and joining them would corrupt
that. Only kinds whose body is *known* to be a single flowing paragraph get normalized. If you need
to widen it, name the kind and justify why its newlines are never meaningful; do not widen it to
chase a rendering artifact that the renderer does not produce.

Related: [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[text-delta-assembly]] [[text-delta-no-word-boundary-awareness]] [[verify-claims-repo-wide-before-asserting]] [[inferred-root-cause-without-reproduction]]

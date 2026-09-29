---
tags: [arcana, rendering, artifact, corrected]
date: 2026-09-01
corrected: 2026-09-15
source: ses_fa5a19358ffeefMYEXA1ra590Z
---
# mid word wrap artifact

Chat prose does NOT split contractions at apostrophes — the original diagnosis was wrong

**Why (original, unverified):** Claimed the chat renderer "wraps at column boundaries and treats
apostrophes as word/token boundaries", rendering `here's` as `here\n's`. This was inferred from a
symptom, never reproduced.

**Why (corrected 2026-09-15):** Reproduced directly against the installed OpenTUI 0.4.4 in
`testRender`. Neither wrap path breaks inside a word at an apostrophe:

- plain `<text wrapMode="word" width={30}>` with `aa bb cc dd ee ff gg hh here's x` → the
  contraction stays whole and wraps as a unit;
- `<markdown width={30} …>` with the same content → identical result.

`here's-omega` *does* break after the hyphen (`here's-` / `omega`) — that is normal terminal
behaviour and a different mechanism.

So a `here\n's` sighting means the text genuinely contains a newline at that offset (the model
emitted one, or a provider wrapped it) — not that the renderer inserted a break. Check the raw part
text before blaming the renderer.

**How to apply:** The invariant is pinned by
`packages/tui/test/chat-wrap-repro.test.tsx` → "a contraction landing on the wrap boundary is not
split at the apostrophe". If that test ever fails, the renderer really did start breaking at
apostrophes and this note's correction should be revisited. Do not re-diagnose this symptom from
scratch — and do not "fix" it by extending `normalizeChatProse`, which would join hard newlines
inside assistant prose (including ones the model intended).

Related: [[normalize-chat-prose-limited-kinds]] [[output-truncation-pipeline]] [[text-delta-assembly]] [[text-delta-no-word-boundary-awareness]] [[prose-width-collapses-to-1-on-first-paint]] [[width-contract-chain]] [[verify-claims-repo-wide-before-asserting]] [[inferred-root-cause-without-reproduction]]

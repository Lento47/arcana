---
tags: [arcana, tui, opentui, truncation, elision]
date: 2026-09-16
source: ses_8a08d498
---
# opentui truncate props vs Locale.truncate

Arcana has **two** elision marks, and they are not the same character:

- `Locale.truncate(value, budget)` (`src/util/locale.ts`) — display-column aware,
  keeps the head plus a **U+2026 `…`**. Drives the spine's rows.
- `<text truncate wrapMode="none" overflow="hidden">` — the OpenTUI prop, used by
  autocomplete, which-key, the artifact viewer, subagent footer. It emits **three
  ASCII periods `...`** and elides the **middle**, keeping head and tail:

```
box width 12   △ PE...ECTOR
box width  8   △ ...TOR
```

Two more measured facts about the prop:

- **Per-span `attributes` is ignored.** `<text attributes={BOLD}><span
  style={{fg}}>` gives per-span *ink* but not per-span weight — a span cannot
  opt out of the parent's bold. Ink is the only per-span channel.
- **Two adjacent shrinking texts fuse.** With `gap={1}`, two `flexShrink>0` +
  `truncate` texts printed `△ PERMIS...INSPECTORco...pt` at 44 columns: the gap
  column is spent absorbing the shrink and both labels close over it. One text
  node with the second segment in a `<span>` and a literal space between them
  elides once and keeps the boundary.

**Why:** a row whose elision mark changes character by which component drew it
reads as a rendering fault, and a fused header (`INSPECTORco...pt`) reads as one
garbled word with no way to tell where the label ended.

**How to apply:** when the budget is known, prefer `Locale.truncate` so the mark
matches the rest of the app. When only layout knows the width (a flex row), use
the prop but keep one truncated node per row — put secondary segments in a span
of the same node rather than a second text — and never rely on `gap` to survive a
squeeze.

Related: [[opentui-border-row-consumes-text-row]] [[width-contract-chain]] [[mid-word-wrap-artifact]] [[output-truncation-pipeline]] [[truncation-type-distinction]] [[arcana-chrome-component-composition]]

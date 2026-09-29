---
tags: [arcana, tui, opentui, layout, yoga]
date: 2026-09-16
source: ses_8a08d498
---
# opentui border row consumes the text row

A `<box>` with `border={["bottom"]}` **and** `height={1}` has no row of its own to
put the border on, so the hairline is painted along the row the text occupies.
Every gap between words, every cell of padding and every leftover column renders
as `─` — the header reads as a strikethrough with its title punched out.

Measured in `packages/tui` (opentui 0.5.9), 120 columns:

```
height={1}   ──△─PERMISSION─INSPECTOR─contract.accept──────────[esc]─Close──
unset          △ PERMISSION INSPECTOR contract.accept            [esc] Close
              ────────────────────────────────────────────────────────────────
```

**Why:** the three panel headers that hit this (approval inspector, permission
inspector, acts timeline) each declared `height={1}` to stay "compact" — a
plausible intent that silently turned their separator into a rule drawn through
the title. The same three panels then wrapped at narrow widths because a
single-row box does not clip its children; the row grew past the box, and the
`[esc]` hint was pushed off the card.

**How to apply:** never set an explicit height on a box that draws a border on
the side you want to be a separator — let the row size to its content and the
border lands under it. If the visual must be one row tall, drop the border and
draw a `<text>{"─".repeat(width)}</text>` yourself. Same rule for any bordered
box whose children can exceed the declared height: the border moves onto them.

Related: [[opentui-truncate-props-vs-locale]] [[arcana-chrome-component-composition]] [[width-contract-chain]] [[mid-word-wrap-artifact]] [[prose-width-collapses-to-1-on-first-paint]] [[arcana-opentui-scroll-coordinates]]

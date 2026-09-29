---
tags: [arcana, tui, opentui, scrollbox, coordinates, layout, bug-class, confidence]
date: 2026-09-15
source: session-tui-polish-wave-1
---

# OpenTUI scrollbox coordinates — `y` is NOT the scroll offset

Measured, not inferred. A probe (`testRender`, 20 rows in a 6-row viewport, box at
layout `y=2`) printed the live renderable state:

| state | `box.y` | `box.scrollTop` | `content.y` | first child `y` |
|---|---|---|---|---|
| at top | 2 | 0 | 2 | 2 |
| scrolled to bottom | 2 | 14 | **-12** | **-12** |

## The contract

- `ScrollBoxRenderable` extends `BoxRenderable` and **neither defines a `y`
  accessor nor ever assigns `this.y`** (verified in the installed dist:
  `index.node.js`, class at ~471486 — `y` accessors inside the class: 0,
  `this.y =` inside the class: 0). `y` is pure flexbox layout position.
- **`scrollTop` / `scrollLeft` are the scroll offsets.** Always.
- **Scrolling translates the content node**: `content.y` = `box.y - scrollTop`, and
  because children are laid out inside it, **a child's `y` already reflects the
  scroll** — it is a scrolled, absolute layout position, not a content offset.
- `scroll.getChildren()` on a scrollbox returns the **content's** children (the real
  rows), not the internal `wrapper`.

## Consequences — which expressions are right

Given the above, for a child `c` inside `scroll` `s`:

| want | expression |
|---|---|
| child's visual offset from the viewport top | `c.y - s.y` |
| child's scroll-independent content offset | `c.y - s.y + s.scrollTop` |
| the viewport's top edge, in the same space as `c.y` | `s.y` |
| delta to `scrollBy` to put `c` at the viewport top | `c.y - s.y` |
| "is the operator at the bottom?" | `scrollHeight - scrollTop - height <= slack` |

`scrollBy(delta)` delegates to `verticalScrollBar.scrollBy(delta, "absolute")` — an
absolute delta added to `scrollTop`.

## The bug class

`y` and `scrollTop` are both smallish integers, so substituting one for the other
often *looks* plausible and fails only in specific states:

- **`use-spine-scroll.ts`** — fed `s.y` into `hasContentAbove`/`hasContentBelow`. The
  spine's scrollbox sits below the header, so `y > 0` permanently: the `↑` cue showed
  while already at the top and the `↓` cue stayed on at the bottom. Fixed to
  `s.scrollTop`.
- **`routes/session/index.tsx` `followIfAtBottom`** — `remaining = scrollHeight - s.y - height`
  is **constant under scrolling** (it ignores the offset entirely), so the guard never
  released and streaming never followed. Fixed via `util/geometry.shouldFollowStream`.

## The false positives — do not "fix" these

The same suspicion flagged three sites that are **correct**; changing them would have
introduced bugs (they are now pinned by source-contract tests):

- `ui/dialog-select.tsx` `moveTo`: `scroll.scrollBy(child.y - scroll.y - centerOffset)`
  — `scrollBy` takes a delta, and `child.y - scroll.y` is exactly the visual offset,
  which is the delta needed to center. Correct as written.
- `routes/session/index.tsx` `findNextVisibleMessage` / `scrollToMessage`: `scroll.y`
  as the viewport's top edge is right because children are in scrolled space. Only the
  local's *name* was wrong; renamed `viewportTop` so nobody "fixes" it into an inversion.
- `findNextVisibleMessage`'s `+ 10` / `- 10` slack is viewport-space, not content-space.

## Also measured: `contentOptions` spread order

`ScrollBoxRenderable` builds its content node as
`{ alignSelf: "flex-start", flexShrink: 0, minWidth/minHeight: "100%", onSizeChange: () => this.recalculateBarProps(), ...mergedContentOptions }`.
The caller's `contentOptions` spreads **last**, so:

- `contentOptions={{ minHeight: 0 }}` legitimately removes the forced floor → the
  scrollbox hugs short content while `maxHeight` still caps it. This is what let
  `ui/dialog.tsx` delete its `setInterval(measureContent, 250)` measurement poll.
- **Do not pass `contentOptions={{ onSizeChange }}`** — it would clobber
  `recalculateBarProps`, breaking scrollbar recalculation on content resize. There is
  no public observer for content-size changes; react to whatever drives the content
  instead (a revision signal, as the spine shell does).

## `scrollbarOptions` configures BOTH axes

Not a coordinate fact but the same family of trap, and it was misdiagnosed once:
`scrollbarOptions={{ visible: true }}` turns on the **horizontal** bar as well as the
vertical one, because the single prop configures both. In `ui/dialog-select.tsx` that
painted a full-width row of `█` through the bottom of the list and stole a row from the
options on **every** open, whatever the content (`scrollX` defaults to `false`, so the
list had nothing to scroll horizontally).

**Per-axis overrides are `verticalScrollbarOptions` / `horizontalScrollbarOptions`.** Set
the axis you mean. A run of ≥2 block glyphs (`U+2580`–`U+259F`) in a captured frame is the
signature — a legitimate vertical bar is exactly one column wide, so `test/dialog-select-render.test.tsx`
asserts `/[▀-▟]{2,}/` never matches a row.

## Tests that pin this

- `test/spine-scroll-indicators.test.tsx` — fails 3/3 against `s.y`, passes with `s.scrollTop`.
- `test/d10-scroll-policy.test.ts` — `shouldFollowStream` policy + source contracts for both fixes.
- `test/ui-dialog-content-height.test.tsx` — grow/shrink after mount with no measurement pass.
- `test/dialog-select-render.test.tsx` — the picker inside its host: footer pinned above the
  fold at 96×20, no block-glyph bar, one blank row above the title. All 5 cases were confirmed
  to fail against the pre-fix picker before landing.

See also [[arcana-diff-freeze-suspect-opentui-renderable]], [[arcana-diffviewer-no-reactive-loop]].

Related: [[arcana-category-identification]] [[arcana-is-security-kernel-not-coding-assistant]] [[arcana-intent-binding-feature]] [[arcana-authorization-vs-completion-verification]] [[arcana-three-tier-publishing-strategy]]

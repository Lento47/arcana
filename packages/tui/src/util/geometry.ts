/**
 * Non-negative geometry clamps (audit B5-B7).
 *
 * Yoga requires non-negative, integer dimensions. Every consumer that derives
 * a width/padding from terminal dimensions must clamp here, at computation
 * time — never let a negative pane width reach the layout engine, and never
 * feed fractional padding to a whole-cell grid.
 */

import { Size, Space } from "../ui/chrome"

/**
 * Diff patch pane width: terminal minus file-tree + border chrome.
 * B5: the unclamped `termWidth - (tree ? 33 : 0) - 4` went negative at
 * ≤ 37 cols with the file tree open (-7 at 30) and was fed to PanelGroup.
 */
export function diffFileTreeWidth(termWidth: number): number {
  const term = Number.isFinite(termWidth) ? Math.max(1, Math.floor(termWidth)) : 1
  return Math.min(32, Math.max(20, Math.floor(term * 0.26)))
}

/**
 * An unmeasurable terminal is not a wide one. `Math.max(1, NaN)` is `NaN`, so a
 * terminal size that has not resolved — which is its state outside a live
 * terminal, and under the test renderer — put a `NaN` width straight into the
 * diff pane's layout instead of falling back to the one-column floor. An
 * infinite terminal is not measured either, and takes the same floor.
 */
export function diffPatchPaneWidth(termWidth: number, showFileTree: boolean, fileTreeWidth = 32): number {
  const term = Number.isFinite(termWidth) ? termWidth : 0
  return Math.max(1, term - (showFileTree ? Math.max(1, fileTreeWidth) + 1 : 0) - 4)
}

/** Responsive tree policy: unified review gets 64 cols; split review gets 84. */
export function diffViewerFileTreeVisible(termWidth: number, enabled: boolean, fileCount: number): boolean {
  if (!enabled || fileCount === 0 || termWidth < 100) return false
  return diffPatchPaneWidth(termWidth, true, diffFileTreeWidth(termWidth)) >= 64
}

/**
 * Home prompt "auto" max width: 70% of the terminal, floor `Size.promptMaxWidth`
 * — but never wider than the terminal itself. B6: the bare floor exceeded the
 * screen on any width below it (e.g. 75 at a 60-col terminal).
 */
export function homePromptMaxWidth(termWidth: number): number {
  const term = Math.max(1, Math.floor(termWidth))
  return Math.min(term, Math.max(Size.promptMaxWidth, Math.floor(term * 0.7)))
}

/**
 * Columns the home footer's directory may occupy: the terminal, less every
 * other segment of the row and the space between them, floored at 0.
 *
 * The footer is one row. Nothing in it is `wrapMode="none"` by accident — the
 * directory is a single unbreakable token, so when the row overran, yoga shrank
 * the text and it wrapped *mid-path*: at 40 columns a 25-column working
 * directory drew five rows (`/tmp/`, `openco`, `de/`, `packag`, `es/tui`),
 * growing the footer by four rows and pulling the whole home screen up with it.
 * The directory is the only segment that can give ground, and it gives it from
 * the left — the leaf and the branch are what tell an operator where they are,
 * so `Locale.truncateLeft` is what consumes this number.
 */
export function footerDirectoryWidth(termWidth: number, reserved: number): number {
  const width = Number.isFinite(termWidth) ? Math.floor(termWidth) : 0
  const taken = Number.isFinite(reserved) ? Math.max(0, Math.floor(reserved)) : 0
  return Math.max(0, width - taken)
}

/**
 * The width left for content drawn inside `inset` columns of chrome, floored at
 * one column.
 *
 * `useTerminalSize` reports an unmeasured renderer as `{ width: 0, height: 0 }`
 * — that is its convention, not a zero-width terminal — so a bare
 * `dimensions().width - inset` hands the layout a negative width on every frame
 * before the first measurement. The toast card was `min(60, width - 6)` (-6 at
 * an unmeasured terminal) and the session route's `ctx.width`, which every tool
 * part measures its own budget against, was `width - 4`. Both arithmetic sites
 * are also where a duplicated literal lived: the route's `4` was a second copy
 * of the frame's own `2 * framePadding(density)`, so a density change moved the
 * padding and left the content width behind.
 *
 * The floor is one column rather than zero because both consumers feed a budget
 * that has to stay non-empty: a zero budget elides every value to nothing, which
 * reads as a tool with no output rather than as a terminal with no room.
 */
export function paneWidth(termWidth: number, inset: number): number {
  const term = Number.isFinite(termWidth) ? Math.max(0, Math.floor(termWidth)) : 0
  const taken = Number.isFinite(inset) ? Math.max(0, Math.floor(inset)) : 0
  return Math.max(1, term - taken)
}

/**
 * The width a transcript entry may draw in: the terminal less the session
 * frame's own horizontal chrome for the current density, floored at one column.
 *
 * This is the number the session route publishes as `ctx.width`, and the frame
 * it describes is `paddingLeft={framePadding(density)}` /
 * `paddingRight={framePadding(density)}` on the same route — so the two are one
 * fact and have to be derived from one place. The route used to subtract a
 * literal `4`, which is `2 * Space.frame("cozy")`: a copy of the default, so
 * choosing compact density moved the padding and left the content width two
 * columns behind it. It was also unclamped, and an unmeasured renderer reads as
 * `{ width: 0 }` — `-4` reached every tool part's budget.
 */
export function sessionContentWidth(
  termWidth: number,
  density?: "compact" | "cozy" | "spacious",
): number {
  return paneWidth(termWidth, Space.frame(density) * 2)
}

/**
 * The renderer's width, or `undefined` when it has not been laid out yet.
 *
 * `useTerminalDimensions()` is not a substitute: it is undefined outside a live
 * terminal, which leaves a readout's budget unmeasured in exactly the rendering
 * tests that are meant to pin its narrow-width behaviour. The statusbar, the
 * home footer and the subagent footer all measure through here.
 */
export function rendererWidth(renderer: { width?: number } | undefined): number | undefined {
  const width = renderer?.width
  return typeof width === "number" && Number.isFinite(width) && width > 0 ? width : undefined
}

/**
 * How many of `widths` fit in `budget`, taken in the order given — most
 * important first — with `gap` columns between each and `gap` before the first.
 *
 * Returns a prefix length, never a partial width, because a readout segment is
 * whole or absent. Letting yoga shrink them instead is what produced `ctx
 * 45.0...3%` and then, once the row overran outright, segments painted over one
 * another (`/ 2parent0.04prev`): a cut segment is not read, it is decoded.
 * Widths are ceiled so a fractional measurement cannot overrun the budget.
 */
export function fitSegments(budget: number, widths: readonly number[], gap = 1): number {
  const room = Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 0
  let used = 0
  let kept = 0
  for (const raw of widths) {
    const width = Number.isFinite(raw) ? Math.max(0, Math.ceil(raw)) : 0
    const next = used + gap + width
    if (next > room) break
    used = next
    kept++
  }
  return kept
}

/**
 * Dialog top inset: a quarter of the terminal height, integer.
 * B7: the raw `height / 4` produced fractional padding (6.25 at height 25),
 * a classic malformat source in whole-cell terminal renderers.
 */
export function dialogVerticalPad(height: number): number {
  return Math.floor(Math.max(0, height) / 4)
}

/**
 * Dialog max width: terminal minus the 2-cell margin, floored at 1.
 * B7: the unclamped `termWidth - 2` went negative at 1–2 cols.
 */
export function dialogMaxWidth(termWidth: number): number {
  return Math.max(1, termWidth - 2)
}

/** Width caps per dialog size — the tokens, not a second copy of the numbers. */
const DIALOG_WIDTH_CAP = {
  medium: Size.dialogMedium,
  large: Size.dialogLarge,
  xlarge: Size.dialogXLarge,
} as const

/**
 * Responsive dialog card width. A fixed xlarge card looked like a full-screen
 * pane on ordinary terminals; keep the established size caps while reserving
 * a visual gutter and still allowing the card to use the available width on
 * small terminals.
 */
export function dialogWidth(
  termWidth: number,
  size: "medium" | "large" | "xlarge",
): number {
  const term = Number.isFinite(termWidth) ? Math.max(1, Math.floor(termWidth)) : 1
  const cap = DIALOG_WIDTH_CAP[size]
  const minimum = size === "xlarge" ? 64 : size === "large" ? 48 : 40
  const ratio = size === "xlarge" ? 0.86 : size === "large" ? 0.78 : 0.72
  const responsive = Math.max(minimum, Math.floor(term * ratio))
  return Math.max(1, Math.min(cap, responsive, dialogMaxWidth(term)))
}

/**
 * Dialog card height below its top inset. O3: an unbounded card let long
 * content render past the terminal with no viewport or reachable tail.
 */
export function dialogMaxHeight(termHeight: number): number {
  const term = Number.isFinite(termHeight) ? Math.max(1, Math.floor(termHeight)) : 1
  return Math.max(1, term - dialogVerticalPad(term))
}

/**
 * Scroll viewport inside the dialog card. Reserve two border rows and the
 * existing one-row top padding; tiny terminals still receive a valid cell.
 */
export function dialogContentMaxHeight(termHeight: number): number {
  return Math.max(1, dialogMaxHeight(termHeight) - 3)
}

/**
 * Composer max height: a third of the terminal height, integer, floored at 6
 * rows. D5: extracted from the prompt's raw `Math.max(6, floor(h / 3))` so no
 * component subtracts its own geometry — the spine owns the contract
 * (command-spine-shell.tsx:69-71). Degenerate heights never drop below 6.
 */
export function promptMaxHeight(termHeight: number): number {
  // Number.isFinite guard mirrors spineProseWidth: NaN/Infinity never reach the
  // max (Math.max(6, NaN) is NaN in JS) — degenerate input falls back to 6.
  const term = Number.isFinite(termHeight) ? Math.max(0, termHeight) : 0
  return Math.max(6, Math.floor(term / 3))
}

/**
 * Scroll-to-bottom button policy: show when more than half a viewport of
 * content remains below the viewport bottom.
 * D10: extracted verbatim from the old 250ms poll (`distanceFromBottom
 * > s.height / 2`) so the event-driven recompute keeps the identical
 * threshold. Degenerate viewports (height <= 0) never show the button —
 * the old code divided by `s.height` here.
 */
export function shouldShowScrollButton(scrollHeight: number, scrollTop: number, viewportHeight: number): boolean {
  if (viewportHeight <= 0) return false
  return scrollHeight - scrollTop - viewportHeight > viewportHeight / 2
}

/**
 * Scroll indicator policy (split): independent above/below checks so the
 * viewport can render a `↑` when content is hidden above and a `↓` when
 * content is hidden below. Each hides when there's nothing to reveal in
 * that direction. The threshold is `> 0` — any pixel of hidden content
 * shows the arrow, since the alternative ("hide until half a viewport")
 * leaves users wondering why they can't get back to a recent entry that
 * scrolled off the top.
 */
export function hasContentAbove(scrollTop: number): boolean {
  return scrollTop > 0
}

export function hasContentBelow(
  scrollHeight: number,
  scrollTop: number,
  viewportHeight: number,
): boolean {
  if (viewportHeight <= 0) return false
  return scrollHeight - scrollTop - viewportHeight > 0
}

/**
 * Stream-follow policy: pin the viewport to the newest content only while the
 * operator is already at the bottom (within `slack` rows, so a couple of rows
 * of drift does not stop following). Never true for a degenerate viewport.
 *
 * Same comparison as `use-spine-scroll`'s reconcile (`distance <= 2`), lifted
 * here so the session route and the spine cannot drift apart. Note the third
 * argument is the **scroll offset** (`scrollTop`), never the renderable's `y`:
 * `y` is the box's layout position, which makes the distance constant and the
 * guard unreachable — the bug this extraction fixes.
 */
export function shouldFollowStream(
  scrollHeight: number,
  scrollTop: number,
  viewportHeight: number,
  slack = 3,
): boolean {
  if (viewportHeight <= 0) return false
  return scrollHeight - scrollTop - viewportHeight <= slack
}

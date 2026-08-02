/**
 * Non-negative geometry clamps (audit B5-B7).
 *
 * Yoga requires non-negative, integer dimensions. Every consumer that derives
 * a width/padding from terminal dimensions must clamp here, at computation
 * time — never let a negative pane width reach the layout engine, and never
 * feed fractional padding to a whole-cell grid.
 */

/**
 * Diff patch pane width: terminal minus file-tree + border chrome.
 * B5: the unclamped `termWidth - (tree ? 33 : 0) - 4` went negative at
 * ≤ 37 cols with the file tree open (-7 at 30) and was fed to PanelGroup.
 */
export function diffPatchPaneWidth(termWidth: number, showFileTree: boolean): number {
  return Math.max(1, termWidth - (showFileTree ? 33 : 0) - 4)
}

/**
 * Home prompt "auto" max width: 70% of the terminal, floor 75 — but never
 * wider than the terminal itself. B6: the bare 75-floor exceeded the screen
 * on any width < 75 (e.g. 75 at a 60-col terminal).
 */
export function homePromptMaxWidth(termWidth: number): number {
  const term = Math.max(1, Math.floor(termWidth))
  return Math.min(term, Math.max(75, Math.floor(term * 0.7)))
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

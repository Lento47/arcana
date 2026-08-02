/**
 * D10 — scroll-policy tests (audit finding D10: 250ms scrollPollInterval).
 *
 * The poll was replaced by event-driven recomputation: the pure geometry
 * policy is extracted into shouldShowScrollButton (identical threshold to
 * the old poll: show when distanceFromBottom > viewportHeight / 2), and the
 * shell/entry sources are contract-checked for the new wiring (id on entry
 * boxes, scrollChildIntoView, onMouseScroll) and the absence of the old
 * machinery (scrollPollInterval, entryNodes, nodeRef).
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { shouldShowScrollButton } from "../src/util/geometry"

const shellSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/command-spine-shell.tsx"),
  "utf8",
)
const entrySrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-entry.tsx"),
  "utf8",
)

describe("shouldShowScrollButton (pure geometry policy)", () => {
  test("stays hidden when at the bottom", () => {
    expect(shouldShowScrollButton(100, 90, 10)).toBe(false)
  })

  test("boundary: exactly half a viewport away stays hidden", () => {
    // Old poll: distanceFromBottom > height / 2 — 5 > 5 is false.
    expect(shouldShowScrollButton(100, 85, 10)).toBe(false)
  })

  test("shows just past half a viewport away", () => {
    expect(shouldShowScrollButton(100, 84, 10)).toBe(true)
  })

  test("hides just under half a viewport away", () => {
    expect(shouldShowScrollButton(100, 86, 10)).toBe(false)
  })

  test("shows when scrolled to the top of tall content", () => {
    expect(shouldShowScrollButton(500, 0, 10)).toBe(true)
  })

  test("hides when content fits the viewport (nothing to scroll)", () => {
    expect(shouldShowScrollButton(10, 0, 10)).toBe(false)
  })

  test("hides on degenerate zero-height viewport (no divide-by-zero)", () => {
    expect(shouldShowScrollButton(100, 0, 0)).toBe(false)
  })

  test("hides on negative distance (scrollTop past content)", () => {
    expect(shouldShowScrollButton(10, 5, 10)).toBe(false)
  })

  test("handles odd viewport heights", () => {
    expect(shouldShowScrollButton(100, 80, 11)).toBe(true)
    expect(shouldShowScrollButton(100, 85, 11)).toBe(false)
  })
})

describe("D10 source contract", () => {
  test("shell no longer polls with scrollPollInterval", () => {
    expect(shellSrc).not.toContain("scrollPollInterval")
  })

  test("shell no longer keeps the entryNodes ref map", () => {
    expect(shellSrc).not.toContain("entryNodes")
  })

  test("shell wires onMouseScroll to the scrollbox", () => {
    expect(shellSrc).toContain("onMouseScroll={handleMouseScroll}")
  })

  test("shell scrolls focused entries via native scrollChildIntoView", () => {
    expect(shellSrc).toContain("scroll.scrollChildIntoView(entryID)")
  })

  test("shell recomputes the button from geometry (refreshScrollButton)", () => {
    expect(shellSrc).toContain("refreshScrollButton")
  })

  test("entry root boxes carry id={entry().id} for findDescendantById", () => {
    expect(entrySrc).toContain("id={entry().id}")
  })

  test("entry no longer exposes the nodeRef registration prop", () => {
    expect(entrySrc).not.toContain("nodeRef")
  })
})

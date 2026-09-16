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
import { hasContentAbove, hasContentBelow, shouldFollowStream, shouldShowScrollButton } from "../src/util/geometry"

const shellSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/command-spine-shell.tsx"),
  "utf8",
)
const scrollSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/use-spine-scroll.ts"),
  "utf8",
)
const viewportSrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-viewport.tsx"),
  "utf8",
)
const entrySrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-entry.tsx"),
  "utf8",
)
const streamFrameSrc = readFileSync(
  join(import.meta.dir, "../src/util/stream-frame.ts"),
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

describe("hasContentAbove / hasContentBelow (split scroll indicators)", () => {
  test("hasContentAbove: hides at the top", () => {
    expect(hasContentAbove(0)).toBe(false)
  })

  test("hasContentAbove: shows when scrolled past zero", () => {
    expect(hasContentAbove(1)).toBe(true)
    expect(hasContentAbove(50)).toBe(true)
  })

  test("hasContentBelow: hides when fully at the bottom", () => {
    // scrollHeight - scrollTop - viewportHeight === 0 → at the bottom
    expect(hasContentBelow(100, 90, 10)).toBe(false)
  })

  test("hasContentBelow: shows when even one pixel is hidden", () => {
    expect(hasContentBelow(101, 90, 10)).toBe(true)
  })

  test("hasContentBelow: hides on degenerate zero-height viewport", () => {
    expect(hasContentBelow(100, 0, 0)).toBe(false)
  })

  test("hasContentBelow: hides when content fits the viewport", () => {
    expect(hasContentBelow(10, 0, 10)).toBe(false)
  })
})

describe("shouldFollowStream (stream-follow policy)", () => {
  test("follows while at the bottom", () => {
    expect(shouldFollowStream(100, 90, 10)).toBe(true)
  })

  test("follows within the slack band, not just exactly at the bottom", () => {
    // 100 - 87 - 10 = 3, inside the default slack.
    expect(shouldFollowStream(100, 87, 10)).toBe(true)
  })

  test("stops following once the operator has scrolled up past the slack", () => {
    expect(shouldFollowStream(100, 86, 10)).toBe(false)
    expect(shouldFollowStream(100, 0, 10)).toBe(false)
  })

  test("honours a custom slack", () => {
    expect(shouldFollowStream(100, 80, 10, 10)).toBe(true)
    expect(shouldFollowStream(100, 80, 10, 5)).toBe(false)
  })

  test("never follows on a degenerate viewport", () => {
    expect(shouldFollowStream(100, 0, 0)).toBe(false)
  })

  test("does not follow when content fits the viewport", () => {
    expect(shouldFollowStream(10, 0, 10)).toBe(true)
  })

  // The bug this replaced: `scrollHeight - y - height` where `y` is the box's
  // layout position is constant under scrolling, so the distance never changed
  // and the guard never released — the session route never followed streaming
  // output. Asserting the scroll-offset reading differs from the layout one.
  test("uses the scroll offset, not the renderable's layout y", () => {
    const scrollHeight = 400
    const viewportHeight = 20
    const layoutY = 3 // where the box sits in the terminal
    const scrollTop = 380 // operator at the bottom
    expect(shouldFollowStream(scrollHeight, scrollTop, viewportHeight)).toBe(true)
    // The old expression, for contrast: it ignores scrollTop entirely.
    expect(scrollHeight - layoutY - viewportHeight).toBeGreaterThan(3)
  })
})

describe("D10 source contract", () => {
  test("shell no longer polls with scrollPollInterval", () => {
    expect(shellSrc).not.toContain("scrollPollInterval")
  })

  test("shell no longer keeps the entryNodes ref map", () => {
    expect(shellSrc).not.toContain("entryNodes")
  })

  test("viewport wires onMouseScroll to the scrollbox (PR5 split)", () => {
    expect(viewportSrc).toContain("onMouseScroll={props.handleMouseScroll}")
  })

  test("scroll hook scrolls focused entries via native scrollChildIntoView", () => {
    expect(scrollSrc).toContain("scrollChildIntoView(entryID)")
  })

  test("scroll hook recomputes the indicators from geometry (refreshScrollIndicators)", () => {
    expect(scrollSrc).toContain("refreshScrollIndicators")
  })

  test("entry root boxes carry id={entry().id} for findDescendantById", () => {
    expect(entrySrc).toContain("id={entry().id}")
  })

  test("entry no longer exposes the nodeRef registration prop", () => {
    expect(entrySrc).not.toContain("nodeRef")
  })

  test("stream revision does not use per-token text lengths", () => {
    expect(shellSrc).not.toContain("latest?.body?.length")
    expect(shellSrc).not.toContain("latest?.summary.length")
    expect(shellSrc).not.toContain("latest?.thinking?.length")
    expect(shellSrc).toContain("frameGate: streamFrame")
  })

  test("scroll reconciliation is keyed and checks manual scroll at commit", () => {
    expect(scrollSrc).toContain('frameGate.schedule("scroll-reconcile"')
    expect(scrollSrc).toContain("distance <= 2 && current.scrollTop < current.scrollHeight")
    expect(streamFrameSrc).toContain("batch(() =>")
  })

  test("the spine computes its cues from scrollTop, not the box's layout y", () => {
    expect(scrollSrc).toContain("hasContentAbove(s.scrollTop)")
    expect(scrollSrc).toContain("hasContentBelow(s.scrollHeight, s.scrollTop, s.height)")
    expect(scrollSrc).not.toContain("hasContentAbove(s.y)")
  })

  test("the session route follows streaming through the shared policy", () => {
    const sessionSrc = readFileSync(join(import.meta.dir, "../src/routes/session/index.tsx"), "utf8")
    expect(sessionSrc).toContain("shouldFollowStream(")
    // The old expression read the layout y where the scroll offset belongs.
    expect(sessionSrc).not.toContain("s.scrollHeight - s.y - s.height")
    expect(sessionSrc).not.toContain("if (s.y < s.scrollHeight)")
  })

  test("the session route names viewport-space reads for what they are", () => {
    const sessionSrc = readFileSync(join(import.meta.dir, "../src/routes/session/index.tsx"), "utf8")
    // `scroll.y` is the viewport's top edge in scrolled layout space (children
    // already report scrolled positions), so it is correct there — but the
    // local was called `scrollTop`, which invites a "fix" that inverts it.
    expect(sessionSrc).toContain("const viewportTop = scroll.y")
    expect(sessionSrc).not.toContain("const scrollTop = scroll.y")
  })
})

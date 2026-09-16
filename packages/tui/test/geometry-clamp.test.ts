import { describe, expect, test } from "bun:test"
import {
  diffFileTreeWidth,
  diffPatchPaneWidth,
  diffViewerFileTreeVisible,
  homePromptMaxWidth,
  dialogVerticalPad,
  dialogMaxWidth,
  dialogMaxHeight,
  dialogContentMaxHeight,
  dialogWidth,
  footerDirectoryWidth,
  fitSegments,
  rendererWidth,
} from "../src/util/geometry"

describe("geometry.diffPatchPaneWidth (B5)", () => {
  test("clamps to >= 1, never negative (the ≤37-col file-tree regression)", () => {
    expect(diffPatchPaneWidth(30, true)).toBe(1) // was -7 unclamped
    expect(diffPatchPaneWidth(37, true)).toBe(1) // was 0 unclamped
    expect(diffPatchPaneWidth(0, true)).toBe(1)
    expect(diffPatchPaneWidth(0, false)).toBe(1)
    expect(diffPatchPaneWidth(4, false)).toBe(1)
  })

  test("reserves 33 cols for the file tree + 4 border chrome", () => {
    expect(diffPatchPaneWidth(40, true)).toBe(3)
    expect(diffPatchPaneWidth(60, true)).toBe(23)
    expect(diffPatchPaneWidth(100, true)).toBe(63)
    expect(diffPatchPaneWidth(30, false)).toBe(26)
    expect(diffPatchPaneWidth(40, false)).toBe(36)
    expect(diffPatchPaneWidth(60, false)).toBe(56)
  })
})

describe("responsive diff geometry", () => {
  test("hides the tree below 100 columns and preserves a useful patch pane", () => {
    expect(diffViewerFileTreeVisible(99, true, 2)).toBe(false)
    expect(diffViewerFileTreeVisible(100, true, 2)).toBe(true)
    expect(diffViewerFileTreeVisible(120, false, 2)).toBe(false)
    expect(diffViewerFileTreeVisible(120, true, 0)).toBe(false)
    expect(diffPatchPaneWidth(100, true, diffFileTreeWidth(100))).toBeGreaterThanOrEqual(64)
  })

  test("scales the tree between 20 and 32 columns", () => {
    expect(diffFileTreeWidth(40)).toBe(20)
    expect(diffFileTreeWidth(100)).toBe(26)
    expect(diffFileTreeWidth(120)).toBe(31)
    expect(diffFileTreeWidth(200)).toBe(32)
  })
})

describe("geometry.homePromptMaxWidth (B6)", () => {
  test("never exceeds the terminal width (the <75-col regression)", () => {
    expect(homePromptMaxWidth(30)).toBe(30) // was 75 — off screen
    expect(homePromptMaxWidth(40)).toBe(40)
    expect(homePromptMaxWidth(60)).toBe(60)
    expect(homePromptMaxWidth(1)).toBe(1)
  })

  test("70% with a 75 floor at comfortable widths", () => {
    expect(homePromptMaxWidth(75)).toBe(75)
    expect(homePromptMaxWidth(100)).toBe(75)
    expect(homePromptMaxWidth(107)).toBe(75)
    expect(homePromptMaxWidth(120)).toBe(84)
    expect(homePromptMaxWidth(200)).toBe(140)
  })
})

describe("geometry.footerDirectoryWidth", () => {
  test("gives the directory whatever the rest of the row does not take", () => {
    expect(footerDirectoryWidth(80, 34)).toBe(46)
    expect(footerDirectoryWidth(120, 34)).toBe(86)
    // Wider reserved segments than the terminal: nothing to give, never negative.
    expect(footerDirectoryWidth(30, 34)).toBe(0)
    expect(footerDirectoryWidth(1, 999)).toBe(0)
  })

  test("survives a non-finite measurement rather than propagating NaN", () => {
    // `NaN` reaches `elidePath`, whose every comparison against `NaN` is false,
    // and the directory renders as an empty string instead of merely eliding.
    expect(footerDirectoryWidth(Number.NaN, 34)).toBe(0)
    expect(footerDirectoryWidth(80, Number.NaN)).toBe(80)
    // Both sides floor to whole cells before subtracting.
    expect(footerDirectoryWidth(80.7, 34.2)).toBe(46)
  })
})

describe("geometry.rendererWidth", () => {
  test("measures a laid-out renderer and refuses an unmeasured one", () => {
    expect(rendererWidth({ width: 120 })).toBe(120)
    expect(rendererWidth(undefined)).toBeUndefined()
    expect(rendererWidth({})).toBeUndefined()
    // Zero and negatives are the pre-layout states of a live renderer, not a
    // terminal one cell wide: a budget built on them hides every segment.
    expect(rendererWidth({ width: 0 })).toBeUndefined()
    expect(rendererWidth({ width: -1 })).toBeUndefined()
    expect(rendererWidth({ width: Number.NaN })).toBeUndefined()
    expect(rendererWidth({ width: Number.POSITIVE_INFINITY })).toBeUndefined()
  })
})

describe("geometry.fitSegments", () => {
  test("keeps a prefix: a segment is whole or absent, never cut", () => {
    // 1 + 9 fits in 11; the next needs 1 + 6 more.
    expect(fitSegments(11, [9, 6, 24])).toBe(1)
    expect(fitSegments(17, [9, 6, 24])).toBe(2)
    expect(fitSegments(42, [9, 6, 24])).toBe(3)
    expect(fitSegments(41, [9, 6, 24])).toBe(2)
  })

  test("counts a gap before the first segment as well as between them", () => {
    expect(fitSegments(9, [9])).toBe(0)
    expect(fitSegments(10, [9])).toBe(1)
    expect(fitSegments(0, [9])).toBe(0)
    // A zero-width segment still costs its gap, so it cannot ride along free.
    expect(fitSegments(0, [0])).toBe(0)
  })

  test("a budget it cannot measure keeps nothing rather than everything", () => {
    expect(fitSegments(Number.NaN, [9])).toBe(0)
    expect(fitSegments(-5, [9])).toBe(0)
  })

  test("a fractional width cannot overrun the budget it was measured against", () => {
    // Ceiled, not floored: a segment needing 11.5 columns is not an 11-column
    // segment, and flooring is how a row ends up one column over and shrinks.
    expect(fitSegments(12, [11.5])).toBe(0)
    expect(fitSegments(13, [11.5])).toBe(1)
  })

  test("a segment that could not be measured costs its gap, not the row", () => {
    // `NaN` reaches here from a `displayWidth` over an unset field. Dropping it
    // would hide a segment that has content; charging it nothing but the gap is
    // the conservative read, and the row still clips rather than grows.
    expect(fitSegments(6, [Number.NaN])).toBe(1)
    expect(fitSegments(0, [Number.NaN])).toBe(0)
  })
})

describe("geometry.dialogVerticalPad (B7)", () => {
  test("floor to integer cells (the fractional-padding regression)", () => {
    expect(dialogVerticalPad(25)).toBe(6) // was 6.25
    expect(dialogVerticalPad(30)).toBe(7)
    expect(dialogVerticalPad(20)).toBe(5)
    expect(dialogVerticalPad(26)).toBe(6)
  })

  test("clamps negative/zero height to 0", () => {
    expect(dialogVerticalPad(0)).toBe(0)
    expect(dialogVerticalPad(-5)).toBe(0)
    expect(dialogVerticalPad(100)).toBe(25)
  })
})

describe("geometry.dialogMaxWidth (B7)", () => {
  test("clamps to >= 1, never negative at tiny terminals", () => {
    expect(dialogMaxWidth(0)).toBe(1)
    expect(dialogMaxWidth(1)).toBe(1)
    expect(dialogMaxWidth(2)).toBe(1)
    expect(dialogMaxWidth(3)).toBe(1)
  })

  test("reserves the 2-cell margin at normal widths", () => {
    expect(dialogMaxWidth(30)).toBe(28)
    expect(dialogMaxWidth(40)).toBe(38)
    expect(dialogMaxWidth(60)).toBe(58)
    expect(dialogMaxWidth(100)).toBe(98)
  })
})

describe("geometry dialog height (O3)", () => {
  test("bounds the card below its top inset", () => {
    expect(dialogMaxHeight(12)).toBe(9)
    expect(dialogMaxHeight(20)).toBe(15)
    expect(dialogMaxHeight(1)).toBe(1)
    expect(dialogMaxHeight(Number.NaN)).toBe(1)
  })

  test("reserves card chrome and keeps a valid viewport", () => {
    expect(dialogContentMaxHeight(12)).toBe(6)
    expect(dialogContentMaxHeight(20)).toBe(12)
    expect(dialogContentMaxHeight(2)).toBe(1)
  })
})

describe("geometry.dialogWidth", () => {
  test("keeps normal dialogs visually inset while respecting size caps", () => {
    expect(dialogWidth(120, "medium")).toBe(60)
    expect(dialogWidth(120, "large")).toBe(88)
    expect(dialogWidth(120, "xlarge")).toBe(103)
    expect(dialogWidth(160, "xlarge")).toBe(116)
  })

  test("shrinks every size to the viewport at narrow terminals", () => {
    expect(dialogWidth(80, "medium")).toBe(57)
    expect(dialogWidth(80, "large")).toBe(62)
    expect(dialogWidth(80, "xlarge")).toBe(68)
    expect(dialogWidth(1, "xlarge")).toBe(1)
  })
})

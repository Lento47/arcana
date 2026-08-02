import { describe, expect, test } from "bun:test"
import {
  diffPatchPaneWidth,
  homePromptMaxWidth,
  dialogVerticalPad,
  dialogMaxWidth,
  dialogMaxHeight,
  dialogContentMaxHeight,
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

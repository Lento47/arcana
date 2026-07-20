import { describe, expect, test } from "bun:test"
import {
  computeAutocompletePlacement,
  computeInlineAutocompleteHeight,
  shouldClearSlashOnHide,
  toParentLocalTop,
} from "../src/component/prompt/autocomplete"

describe("slash autocomplete hide behavior", () => {
  test("clears only an unfinished slash token", () => {
    expect(shouldClearSlashOnHide("/")).toBe(true)
    expect(shouldClearSlashOnHide("/con")).toBe(true)
    expect(shouldClearSlashOnHide("/contract ")).toBe(false)
    expect(shouldClearSlashOnHide("/contract hello")).toBe(false)
    expect(shouldClearSlashOnHide("/consensus Arcana task")).toBe(false)
  })
})

describe("autocomplete placement", () => {
  test("command-spine prefers above the bottom composer even when below has a sliver", () => {
    // Bordered prompt near bottom: y=32 height=4 of 40-row terminal → footer under it.
    const p = computeAutocompletePlacement({
      anchorY: 32,
      anchorHeight: 4,
      termHeight: 40,
      optionCount: 12,
      commandSpine: true,
    })
    expect(p.side).toBe("above")
    expect(p.top + p.panelHeight).toBeLessThanOrEqual(32)
    expect(p.listHeight).toBeGreaterThan(1)
    // Border + title consume chrome rows
    expect(p.panelHeight).toBe(p.listHeight + 3)
  })

  test("default shell picks the roomier side", () => {
    const above = computeAutocompletePlacement({
      anchorY: 30,
      anchorHeight: 3,
      termHeight: 40,
      optionCount: 5,
      commandSpine: false,
    })
    expect(above.side).toBe("above")

    const below = computeAutocompletePlacement({
      anchorY: 2,
      anchorHeight: 3,
      termHeight: 40,
      optionCount: 5,
      commandSpine: false,
    })
    expect(below.side).toBe("below")
  })

  test("never exceeds available room or max list of 10", () => {
    const p = computeAutocompletePlacement({
      anchorY: 8,
      anchorHeight: 3,
      termHeight: 40,
      optionCount: 50,
      commandSpine: true,
    })
    expect(p.listHeight).toBeLessThanOrEqual(10)
    expect(p.top).toBeGreaterThanOrEqual(0)
    expect(p.top + p.panelHeight).toBeLessThanOrEqual(8)
  })

  test("converts screen-absolute top to parent-local (short parent at bottom)", () => {
    // Real failure mode: parent is only as tall as the composer (parentY ≈ anchorY).
    // Placement must use absolute anchorY=32, then localTop becomes negative so the
    // panel paints above the short parent.
    const abs = computeAutocompletePlacement({
      anchorY: 32,
      anchorHeight: 4,
      termHeight: 40,
      optionCount: 12,
      commandSpine: true,
    })
    const parentY = 32
    const localTop = toParentLocalTop(abs.top, parentY)
    expect(abs.side).toBe("above")
    expect(localTop).toBeLessThan(0)
    expect(localTop + abs.panelHeight).toBe(0) // flush with top of parent / composer
  })

  test("relative y≈0 must not be fed as anchorY (regression)", () => {
    // If we wrongly pass parent-local y (0) as anchorY, spaceAbove collapses.
    const wrong = computeAutocompletePlacement({
      anchorY: 0,
      anchorHeight: 4,
      termHeight: 40,
      optionCount: 12,
      commandSpine: true,
    })
    expect(wrong.listHeight).toBe(1) // crushed — this is the bug we avoid

    const right = computeAutocompletePlacement({
      anchorY: 32,
      anchorHeight: 4,
      termHeight: 40,
      optionCount: 12,
      commandSpine: true,
    })
    expect(right.listHeight).toBeGreaterThan(5)
  })

  test("inline spine height uses a terminal budget so the list is usable", () => {
    const h = computeInlineAutocompleteHeight({
      optionCount: 20,
      termHeight: 40,
      commandSpine: true,
    })
    expect(h.listHeight).toBeGreaterThanOrEqual(4)
    expect(h.listHeight).toBeLessThanOrEqual(10)
    expect(h.panelHeight).toBe(h.listHeight + 3)
  })
})

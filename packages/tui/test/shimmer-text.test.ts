import { expect, test } from "bun:test"
import { colorToRgb } from "../src/component/shimmer-text"
import { RGBA } from "@opentui/core"

test("colorToRgb accepts hex strings", () => {
  expect(colorToRgb("#e74c3c")).toEqual([231, 76, 60])
  expect(colorToRgb("e74c3c")).toEqual([231, 76, 60])
})

test("colorToRgb accepts OpenTUI RGBA objects (0–1 channels)", () => {
  expect(colorToRgb(RGBA.fromValues(1, 0, 0, 1))).toEqual([255, 0, 0])
})

test("colorToRgb falls back when given undefined or garbage", () => {
  expect(colorToRgb(undefined)).toEqual([224, 166, 75])
  expect(colorToRgb("nope")).toEqual([224, 166, 75])
})

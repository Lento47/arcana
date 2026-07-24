import { describe, expect, test } from "bun:test"
import {
  COMPACT_NOW_PERCENT,
  COMPACT_SOON_PERCENT,
  contextPressure,
} from "../../src/util/context-pressure"

describe("contextPressure", () => {
  test("defaults match engine 85 / 95 bands", () => {
    expect(COMPACT_SOON_PERCENT).toBe(85)
    expect(COMPACT_NOW_PERCENT).toBe(95)
  })

  test("undefined below soon threshold", () => {
    expect(contextPressure(null)).toBeUndefined()
    expect(contextPressure(undefined)).toBeUndefined()
    expect(contextPressure(84)).toBeUndefined()
  })

  test("soon at 85 inclusive", () => {
    expect(contextPressure(85)).toBe("compact soon")
    expect(contextPressure(94)).toBe("compact soon")
  })

  test("now at 95 inclusive", () => {
    expect(contextPressure(95)).toBe("compact now")
    expect(contextPressure(100)).toBe("compact now")
  })
})

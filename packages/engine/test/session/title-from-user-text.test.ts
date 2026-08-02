import { describe, expect, test } from "bun:test"
import { isDefaultTitle, titleFromUserText, TITLE_MAX_CHARS } from "../../src/session/session"

describe("Session title helpers", () => {
  test("isDefaultTitle matches ISO defaults only", () => {
    expect(isDefaultTitle("New session - 2026-07-23T00:39:44.820Z")).toBe(true)
    expect(isDefaultTitle("Child session - 2026-07-23T00:39:44.820Z")).toBe(true)
    expect(isDefaultTitle("Greeting")).toBe(false)
    expect(isDefaultTitle("New session - custom")).toBe(false)
  })

  test("titleFromUserText extracts a stable short title", () => {
    expect(titleFromUserText("implement rate limiting for the API")).toBe("implement rate limiting for the API")
    expect(titleFromUserText("\n\n  first line\nsecond")).toBe("first line")
    expect(titleFromUserText("# Debug flaky tests")).toBe("Debug flaky tests")
    expect(titleFromUserText("   \n\t  ")).toBeUndefined()
  })

  test("titleFromUserText respects max length", () => {
    const long = "word ".repeat(40).trim()
    const out = titleFromUserText(long)
    expect(out).toBeDefined()
    expect(out!.length).toBeLessThanOrEqual(TITLE_MAX_CHARS)
    expect(out!.endsWith("…")).toBe(true)
  })

  test("custom titles are never classified as default (clobber guard)", () => {
    const heuristic = titleFromUserText("hello there")
    expect(heuristic).toBe("hello there")
    expect(isDefaultTitle(heuristic!)).toBe(false)
  })
})

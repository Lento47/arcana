import { describe, expect, test } from "bun:test"
import { displaySessionTitle, isDefaultTitle, titleFromUserText } from "../../src/util/session"

describe("util.session", () => {
  test("recognizes generated parent and child titles", () => {
    expect(isDefaultTitle("New session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("Child session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("New session - custom")).toBeFalse()
    expect(isDefaultTitle("Jacobian calculus explanation")).toBeFalse()
  })

  test("titleFromUserText uses first non-empty line and caps length", () => {
    expect(titleFromUserText("  \n  hello world  \n more")).toBe("hello world")
    expect(titleFromUserText("# Heading title")).toBe("Heading title")
    expect(titleFromUserText("   ")).toBeUndefined()
    expect(titleFromUserText("")).toBeUndefined()
    const long = "a".repeat(80)
    const out = titleFromUserText(long, 60)
    expect(out?.length).toBe(60)
    expect(out?.endsWith("...")).toBeTrue()
  })

  test("displaySessionTitle keeps custom titles", () => {
    expect(displaySessionTitle({ title: "Math calculations theorem overview" })).toBe(
      "Math calculations theorem overview",
    )
  })

  test("displaySessionTitle prefers first user text over ISO default", () => {
    expect(
      displaySessionTitle({
        title: "New session - 2026-07-23T00:39:44.820Z",
        firstUserText: "explain Jacobian calculus with a local example",
      }),
    ).toBe("explain Jacobian calculus with a local example")
  })

  test("displaySessionTitle humanizes ISO default without message text", () => {
    const label = displaySessionTitle({
      title: "New session - 2026-07-22T22:10:50.760Z",
    })
    expect(label.startsWith("Untitled · ")).toBeTrue()
    expect(label.includes("2026-07-22T")).toBeFalse()
  })

  test("backfill candidate: default + first user text yields non-default title", () => {
    const stored = "New session - 2026-07-23T00:39:44.820Z"
    expect(isDefaultTitle(stored)).toBeTrue()
    const next = titleFromUserText("Jacobian calculus explanation with loc example")
    expect(next).toBe("Jacobian calculus explanation with loc example")
    expect(isDefaultTitle(next!)).toBeFalse()
  })
})

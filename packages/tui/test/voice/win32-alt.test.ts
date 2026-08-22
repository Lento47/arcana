import { expect, test } from "bun:test"
import { win32AltKeyDown } from "../../src/terminal-win32"

test("win32AltKeyDown is a boolean and does not throw", () => {
  expect(typeof win32AltKeyDown()).toBe("boolean")
})

test("win32AltKeyDown is false when Alt is not held", () => {
  if (process.platform !== "win32") return
  expect(win32AltKeyDown()).toBe(false)
})

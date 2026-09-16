import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { abbreviateHome, directoryLabel, elidePath } from "../src/runtime"
import { TuiPathsProvider, useTuiPaths } from "../src/context/runtime"
import { Locale } from "../src/util/locale"

test("abbreviates paths within home boundaries", () => {
  expect(abbreviateHome("/home/test", "/home/test")).toBe("~")
  expect(abbreviateHome("/home/test/project", "/home/test")).toBe("~/project")
  expect(abbreviateHome("/home/tester/project", "/home/test")).toBe("/home/tester/project")
  expect(abbreviateHome("/tmp/project", "/home/test")).toBe("/tmp/project")
})

/**
 * The elision a footer directory gets when the row is too narrow to hold it.
 * A column-exact cut lands mid-name (`…s/tui`), which is the same as no leaf at
 * all; a path is a sequence of names, so the cut belongs on a separator.
 */
describe("elidePath", () => {
  const DIR = "/tmp/opencode/packages/tui" // 26 columns

  test("returns the path untouched when it already fits", () => {
    expect(elidePath(DIR, 26)).toBe(DIR)
    expect(elidePath(DIR, 40)).toBe(DIR)
    expect(elidePath("~", 1)).toBe("~")
  })

  test("cuts on a separator rather than mid-name", () => {
    // By width alone 7 columns is `…es/tui`; the boundary cut gives `…/tui`.
    // The candidates are 5 (`…/tui`), 14, 23 and 27 columns, so each boundary
    // holds the range up to the next one.
    expect(elidePath(DIR, 7)).toBe("…/tui")
    expect(elidePath(DIR, 13)).toBe("…/tui")
    expect(elidePath(DIR, 14)).toBe("…/packages/tui")
    expect(elidePath(DIR, 22)).toBe("…/packages/tui")
    expect(elidePath(DIR, 23)).toBe("…/opencode/packages/tui")
    expect(elidePath(DIR, 25)).toBe("…/opencode/packages/tui")
  })

  test("never exceeds the budget it was given", () => {
    for (let budget = 1; budget <= 30; budget++) {
      expect(Locale.displayWidth(elidePath(DIR, budget))).toBeLessThanOrEqual(budget)
    }
  })

  test("a leaf with no separator falls back to a plain left cut", () => {
    expect(elidePath("arcanagov", 4)).toBe("…gov")
  })
})

/**
 * The directory line is two names — a path and a branch — and the branch is
 * short enough to be worth protecting, but not worth keeping half of.
 */
describe("directoryLabel", () => {
  const PATH = "/tmp/opencode/packages/tui" // 26 columns
  const BRANCH = "arcanagov" // 9
  const BOTH = { path: PATH, branch: BRANCH }

  test("shows both names whenever they fit", () => {
    expect(directoryLabel(BOTH, 36)).toBe(PATH + ":" + BRANCH)
    expect(directoryLabel(BOTH, 80)).toBe(PATH + ":" + BRANCH)
    expect(directoryLabel({ path: PATH }, 26)).toBe(PATH)
  })

  test("keeps the branch whole and spends the rest on the path", () => {
    // 26 columns: 10 for `:arcanagov`, 16 for a path that reads.
    expect(directoryLabel(BOTH, 26)).toBe("…/packages/tui:" + BRANCH)
    expect(directoryLabel(BOTH, 15)).toBe("…/tui:" + BRANCH)
  })

  test("drops the branch rather than cut it mid-name", () => {
    // Below `…/tui` + the branch there is no room for both, and a branch that
    // reads `anagov` is worth nothing: the path leaf keeps the columns.
    expect(directoryLabel(BOTH, 14)).toBe("…/packages/tui")
    expect(directoryLabel(BOTH, 6)).toBe("…/tui")
    expect(directoryLabel(BOTH, 0)).toBe("")
  })

  test("never exceeds the budget it was given", () => {
    for (let budget = 0; budget <= 40; budget++) {
      const label = directoryLabel(BOTH, budget)
      expect(Locale.displayWidth(label)).toBeLessThanOrEqual(budget)
      // Whatever survives, it is never a fragment of the branch.
      if (label.includes(BRANCH)) expect(label.endsWith(":" + BRANCH)).toBe(true)
    }
  })
})

test("provides focused immutable runtime inputs", async () => {
  let paths: ReturnType<typeof useTuiPaths>

  function Runtime() {
    paths = useTuiPaths()
    return <text>{paths.cwd}</text>
  }

  const app = await testRender(
    () => (
      <TuiPathsProvider value={{ cwd: "/work", home: "/home/test", state: "/state", worktree: "/worktree" }}>
        <Runtime />
      </TuiPathsProvider>
    ),
    { width: 40, height: 3 },
  )

  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("/work")
    expect(Object.isFrozen(paths!)).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})

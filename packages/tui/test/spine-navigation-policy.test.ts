/**
 * Child-session navigation policy guard.
 *
 * The shell must route ALL child-session navigation through one helper that
 * branches on handler EXISTENCE, never on the handler's return value.
 * `onNavigateToSession` is declared `(sessionID: string) => void`
 * (shell/types.ts). The old `handler?.() ?? route.navigate(...)` pattern
 * double-navigated whenever a compliant void handler was passed; it only
 * worked by accident because the sole caller happened to be async.
 *
 * If you intentionally change the navigation contract, update
 * shell/types.ts AND this guard together.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const SHELL = join(
  import.meta.dir,
  "..",
  "src",
  "shell",
  "command-spine",
  "command-spine-shell.tsx",
)

describe("child-session navigation policy", () => {
  test("shell never coalesces navigation into the handler's return value", () => {
    const text = readFileSync(SHELL, "utf8")
    expect(text.includes("onNavigateToSession?.(")).toBe(false)
    expect(text.includes('?? route.navigate({ type: "session"')).toBe(false)
  })

  test("all child-session navigation flows through navigateToChildSession", () => {
    const text = readFileSync(SHELL, "utf8")
    // One definition + three call sites: activateFocusedEntry (Enter on a
    // subagent row), openFocusedEntrySession ("o" details), and the
    // SpineViewport onNavigate prop.
    const uses = text.split("navigateToChildSession").length - 1
    expect(uses).toBeGreaterThanOrEqual(4)
  })
})

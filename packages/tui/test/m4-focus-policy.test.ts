/**
 * M4 — double-focus fix (audit finding M4: row registered BOTH
 * `onMouseDown={handleFocus}` and `onMouseUp={handleFocus}`).
 *
 * A single physical click dispatches mousedown then mouseup, so a plain row
 * click fired `onFocus` twice. The suppression flag was only ever armed by
 * `handleToggle` (header path), never for plain row clicks — and it was
 * cleared via queueMicrotask, so it couldn't even catch the leaked row
 * mouseup on the toggle path. Both bindings reduced to one.
 *
 * The interaction-level assertion (single mousedown+up sequence → onFocus
 * exactly once) lives in spine-entry-interaction.test.tsx (runs on CI/Linux
 * where `bun test` works). This file contract-checks the source wiring, and
 * verify-m4-focus.standalone.ts mirrors it for Windows where `bun test`
 * segfaults.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const entrySrc = readFileSync(
  join(import.meta.dir, "../src/shell/command-spine/spine-entry.tsx"),
  "utf8",
)

describe("M4 source contract — one focus per physical click", () => {
  test("row box keeps onMouseDown={handleFocus} (immediate focus on press)", () => {
    expect(entrySrc).toContain("onMouseDown={handleFocus}")
  })

  test("row box no longer binds onMouseUp={handleFocus} (the double-fire root)", () => {
    expect(entrySrc).not.toContain("onMouseUp={handleFocus}")
  })

  test("dead suppression flag suppressNextFocusMouseUp removed", () => {
    // The flag was the only conditional in handleFocus; its removal is the
    // contract. (Verified structurally: no suppressNextFocusMouseUp anywhere.)
    expect(entrySrc).not.toContain("suppressNextFocusMouseUp")
  })

  test("dead releaseFocusSuppression helper removed", () => {
    expect(entrySrc).not.toContain("releaseFocusSuppression")
  })

  test("handleToggle keeps the 120ms lastToggleAt debounce (anti-double-toggle)", () => {
    expect(entrySrc).toContain("lastToggleAt")
    expect(entrySrc).toContain("now - lastToggleAt < 120")
  })

  test("header toggle handlers still wired (handleHeaderMouseDown/Up)", () => {
    expect(entrySrc).toContain("handleHeaderMouseDown")
    expect(entrySrc).toContain("handleHeaderMouseUp")
  })
})

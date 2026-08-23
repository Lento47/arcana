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
  test("row box routes press handling through the selection-safe mouse contract", () => {
    expect(entrySrc).toContain("onMouseDown={handleRowMouseDown}")
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

  test("header owns disclosure without a timing debounce", () => {
    expect(entrySrc).not.toContain("lastToggleAt")
    expect(entrySrc).not.toContain("handleRowToggle")
  })

  test("PR5: header toggles on mouseup only - no mousedown toggle handler", () => {
    // Conventional left-click timing: disclosure happens on release. Right
    // click is reserved for the action menu and never toggles disclosure.
    expect(entrySrc).toContain("handleHeaderMouseUp")
    expect(entrySrc).not.toContain("handleHeaderMouseDown")
    expect(entrySrc).toContain("event.button !== MouseButton.LEFT")
  })
})

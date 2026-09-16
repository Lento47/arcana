/** @jsxImportSource @opentui/solid */
/**
 * The artifact overlay's header, rendered.
 *
 * The row is one line of chrome — mark, title, readout, dismissal — and it must
 * stay one line at every width. It did not: with all five segments flexible,
 * yoga shared the deficit among them and the header *decoded* instead of
 * degrading. At 60 columns `markdown` and `v3/7` each broke across two rows
 * mid-word (`markdow` / `n`), and the dismissal was cut in half vertically —
 * `✕` on one row with `Close` under it, then `Clos` / `e` at 40, `Clo` / `se` at
 * 32, and at 24 columns the close mark itself was gone with a stray `os` left
 * hanging in the header.
 *
 * The row now has exactly one elastic child — the title, which truncates with a
 * mark — and every other segment is whole or absent: the readout is dropped
 * below its real width rather than decoded, and the dismissal is never the thing
 * that gives way. All four are pinned here, because each is the failure mode
 * that was actually on screen.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ArtifactViewer, type ArtifactDisplay } from "../src/routes/session/artifact-viewer"
import { TestTuiProviders } from "./fixture/tui-providers"

const TITLE = "intent-contract-acceptance-matrix-and-evidence"
const READOUT = "markdown v3/7"
/** The mark that says "this is an artifact" — drawn at every width, always. */
const MARK = "◇"
const CLOSE = "[esc] Close"
const HAIRLINE = /^─+$/

const ARTIFACT: ArtifactDisplay = {
  id: "art_1",
  title: TITLE,
  content: "some body text here",
  type: "markdown",
  version: 3,
  versions: 7,
  tags: ["contract"],
}

/** Below this the readout is given up; it fits in `width - 2 * Space.padX`. */
const SHOWS_READOUT = [120, 80, 60]
const HIDES_READOUT = [48, 40, 32, 24]
const WIDTHS = [...SHOWS_READOUT, ...HIDES_READOUT]

async function shot(width: number) {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <ArtifactViewer artifact={ARTIFACT} onClose={() => {}} />
      </TestTuiProviders>
    ),
    { width, height: 8 },
  )
  let frame = ""
  for (let attempt = 0; attempt < 12; attempt++) {
    await app.renderOnce()
    await app.flush()
    const next = app.captureCharFrame()
    if (next.trim().length > 0 && next === frame) break
    frame = next
    await Bun.sleep(20)
  }
  app.renderer.destroy()
  return frame.split("\n")
}

/** The header row is the one the artifact's own mark sits in. */
function headerRow(rows: string[]): number {
  const row = rows.findIndex((line) => line.includes(MARK))
  expect(row).toBeGreaterThan(-1)
  return row
}

test("the header is one row at every width, with the rule under it", async () => {
  for (const width of WIDTHS) {
    const rows = await shot(width)
    const row = headerRow(rows)

    // One row of header, whatever the width: nothing that belongs to the header
    // is drawn below the rule. This is where `markdow` / `n` and the second half
    // of the dismissal used to land.
    expect(rows.filter((line) => line.includes(MARK)).length).toBe(1)
    const below = rows.slice(row + 3).join("\n")
    for (const fragment of ["intent", "markdown", "v3/", "[esc]"]) {
      expect(below).not.toContain(fragment)
    }

    // No rule through the title, and the rule lands on its own row under the
    // box's bottom inset, full width.
    expect(rows[row]!).not.toContain("─")
    expect(rows[row + 1]!.trim()).toBe("")
    expect(HAIRLINE.test(rows[row + 2]!)).toBe(true)
    expect(rows[row + 2]!.length).toBe(width)
  }
})

test("the dismissal never breaks in half", async () => {
  for (const width of WIDTHS) {
    const rows = await shot(width)
    // Every row that mentions the key carries the whole verb — never `Clos`/`e`.
    for (const row of rows) {
      if (row.includes("[esc]")) expect(row).toContain(CLOSE)
    }
    expect(rows.filter((row) => row.includes(CLOSE)).length).toBe(1)
  }
})

test("the readout is whole or absent, and never decoded", async () => {
  for (const width of WIDTHS) {
    const rows = await shot(width)
    // Whole, in one row, or not on screen at all. A fragment of it anywhere is
    // the bug this pins: the type split as `markdow` on one row and `n` on the
    // next, the version as `v3/` and `7`, reads as neither of them.
    for (const fragment of ["markdow", "v3/"]) {
      for (const row of rows) {
        if (row.includes(fragment)) expect(row).toContain(READOUT)
      }
    }
    if (SHOWS_READOUT.includes(width)) expect(rows.join("\n")).toContain(READOUT)
    // Given up as a unit rather than squeezed: nothing of it survives.
    if (HIDES_READOUT.includes(width)) {
      expect(rows.join("\n")).not.toContain("markdown")
      expect(rows.join("\n")).not.toContain("v3/")
    }
  }
})

test("the mark and the title's identity survive the squeeze", async () => {
  for (const width of WIDTHS) {
    const rows = await shot(width)
    const row = headerRow(rows)
    // The mark is fixed: it is how the artifact announces itself.
    expect(rows[row]!).toContain(MARK)
    // And the title yields with a truncation mark rather than vanishing — the
    // header still says which artifact this is down to 32 columns.
    if (width >= 32) expect(rows[row]!.split("...").length - 1).toBeLessThanOrEqual(1)
  }
})

test("the overlay teaches the key that closes it", async () => {
  const rows = await shot(120)
  // The overlay is dismissed with escape (`routes/session/index.tsx` binds it)
  // and every dialog in the app spells that `[esc] Close`. The header used to
  // offer only a hand-drawn `✕ Close`, on the surface most dependent on the key.
  expect(rows.join("\n")).toContain(CLOSE)
})

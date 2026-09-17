/** @jsxImportSource @opentui/solid */
/**
 * The fatal screen's two controls are whole at every width, and their fill
 * stays on its own row.
 *
 * Both rows were `flexDirection="row"` with *every* child elastic, so a
 * terminal too narrow for the pair made yoga share the deficit between the
 * prose and the buttons instead of taking it out of the prose. At 60 columns
 * the screen printed `Reset` and `TUI` on separate lines with `Exi` over `t`
 * beside them; at 50 the copy label came apart across three lines inside its
 * own fill: `Copy Issue URL ( / Exception Info Pre- / filled)`. On the one
 * screen where the operator is already having a bad day, the only two controls
 * it offers were the part that stopped being readable.
 *
 * The prose is now each row's only elastic segment and every control is
 * reserved at its own width, so a narrow row wraps the sentence and nothing
 * else moves. One decision governs both rows — `INLINE_MIN`, 114 columns — so
 * the screen never reads as two unrelated layouts. Below it the sentence takes
 * its own line and the controls move to a row of their own against the frame's
 * right edge; at 114 and wider they share the row.
 *
 * The buttons are also horizontal-padded only, and that is what the fill
 * assertions below hold. With vertical padding a button is a three-row slab,
 * and its bottom padding row landed on the row beneath it — an amber bar
 * running behind the "Technical Details" heading (the heading's `:` painted on
 * the fill at 50 columns, blank runs at 100). A one-row-tall fill can only
 * cover the row it is on, so `no fill ever shares a row with a heading, a
 * stack frame, or the message` is an invariant now rather than a coincidence.
 *
 * A width here is the whole terminal: the fatal screen paints the whole
 * renderer. 114 and 58 (the width at which the long copy label no longer fits
 * its own row) are the two breakpoints; no width below sits on either.
 *
 * Where a control *is* comes from `captureSpans()`, not from the character
 * frame: the restart sentence contains the words "Reset TUI", so searching the
 * frame for that label finds the sentence first. A background is also only a
 * background — `captureCharFrame()` cannot tell a fill under a space from the
 * page, and the padding rows of a fill are exactly the ones that hurt.
 */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ExitProvider } from "../src/context/exit"
import { ErrorComponent } from "../src/component/error-component"
import { TestTuiProviders } from "./fixture/tui-providers"

const SENTENCE_COPY = "arcana encountered a fatal error and needs to restart."
const SENTENCE_RESTART = "Press Reset TUI to restart, or Exit to close arcana."
const COPY_LONG = "Copy Issue URL (Exception Info Pre-filled)"
const COPY_SHORT = "Copy issue URL"
const RESET = "Reset TUI"
const EXIT = "Exit"
/** Enough of the heading to find it where it wraps; it wraps below 36. */
const HEADING = "Technical Details"
/** Where the sentence and its controls share a row. */
const INLINE_MIN = 114
/** Where the long copy label stops fitting a row of its own. */
const COPY_LONG_MIN = 58

const INLINE = [130, 120, 116]
const STACKED = [112, 100, 90, 80, 70, 62]
const SHORT = [56, 50, 40, 30]
const WIDTHS = [...INLINE, ...STACKED, ...SHORT]

const ERROR = Object.assign(new Error("write after end: the renderer socket closed mid-frame"), {
  stack: "Error: write after end\n    at Socket.write (node:net:1)\n    at Renderer.flush (src/renderer.ts:1)",
})

let app: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

type Captured = { rows: string[]; spans: ReturnType<NonNullable<typeof app>["captureSpans"]> }
type Row = { y: number; painted: string[]; spans: { text: string; bg: string | undefined }[] }

async function shot(width: number, height = 20): Promise<Captured> {
  app = await testRender(
    () => (
      <TestTuiProviders>
        <ExitProvider exit={() => {}}>
          <ErrorComponent error={ERROR} reset={() => {}} />
        </ExitProvider>
      </TestTuiProviders>
    ),
    { width, height },
  )
  let frame = ""
  for (let attempt = 0; attempt < 20; attempt++) {
    await app.renderOnce()
    await app.flush()
    const next = app.captureCharFrame()
    if (next.trim().length > 0 && next === frame) break
    frame = next
    await Bun.sleep(20)
  }
  const spans = app.captureSpans()
  return { rows: frame.split("\n"), spans }
}

/**
 * The page's own background: whatever most of the screen is painted in. Not a
 * sampled span — a wrapped text continuation can come back with no background
 * of its own, and one such span should not redefine the page for every other
 * span on the screen.
 */
function pageBackground(spans: Captured["spans"]): string | undefined {
  const counts = new Map<string, number>()
  for (const line of spans.lines) {
    for (const span of line.spans) {
      if (!span.bg || span.bg.a === 0 || span.text.trim().length === 0) continue
      const key = span.bg.toString()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  let page: string | undefined
  let most = 0
  for (const [key, count] of counts) {
    if (count > most) {
      most = count
      page = key
    }
  }
  return page
}

/**
 * Every row, with the trimmed text of each span that wears a fill. A span with
 * a transparent background is the page showing through, not a fill.
 */
function rows(spans: Captured["spans"], page: string | undefined): Row[] {
  return spans.lines.map((line, y) => ({
    y,
    painted: line.spans
      .filter((span) => span.text.trim().length > 0 && span.bg != undefined && span.bg.a > 0 && span.bg.toString() !== page)
      .map((span) => span.text.trim()),
    spans: line.spans.map((span) => ({ text: span.text, bg: span.bg?.toString() })),
  }))
}

/** The row a control is on: the row whose fill carries its whole label. */
function control(captured: Captured, label: string) {
  const page = pageBackground(captured.spans)
  return rows(captured.spans, page).find((row) => row.painted.includes(label))
}

/** The row the copy control is on, at whichever spelling this width uses. */
function copyLabel(width: number) {
  return width >= COPY_LONG_MIN ? COPY_LONG : COPY_SHORT
}

test("every control is a whole label at every width", async () => {
  for (const width of WIDTHS) {
    const captured = await shot(width)
    const page = pageBackground(captured.spans)
    const runs = rows(captured.spans, page).flatMap((row) => row.painted)
    // Exactly the three controls, each whole. A fragment (`Reset`, `Exi`,
    // `Copy Issue URL (`) is in neither list and fails the set comparison.
    expect([...runs].sort()).toEqual([copyLabel(width), EXIT, RESET].sort())
  }
})

test("no fill shares a row with anything but the sentence it belongs to", async () => {
  for (const width of WIDTHS) {
    const captured = await shot(width)
    const page = pageBackground(captured.spans)
    for (const row of rows(captured.spans, page)) {
      if (row.painted.length === 0) continue
      // Prose on a filled row may only be prose from that row's own sentence.
      for (const span of row.spans) {
        if (span.bg !== page) continue
        const text = span.text.trim()
        if (text.length === 0) continue
        expect(SENTENCE_COPY.includes(text) || SENTENCE_RESTART.includes(text)).toBe(true)
      }
    }
    // The heading, the stack frames and the message never share a fill — this
    // is the amber bar that ran behind the heading's own text.
    for (const row of rows(captured.spans, page)) {
      const prose = row.spans.map((span) => span.text).join("")
      const quiet = [HEADING, "at Socket.write", "write after end: the renderer"].filter((text) => prose.includes(text))
      expect(quiet.length === 0 || row.painted.length === 0).toBe(true)
    }
  }
})

test("the sentence and its controls share a row while both fit", async () => {
  for (const width of INLINE) {
    const captured = await shot(width)
    const copy = control(captured, COPY_LONG)
    const reset = control(captured, RESET)
    expect(copy).toBeDefined()
    expect(reset).toBeDefined()
    // The same row as its sentence, not merely somewhere below it.
    expect(copy!.spans.some((span) => span.text.includes(SENTENCE_COPY))).toBe(true)
    expect(reset!.spans.some((span) => span.text.includes(SENTENCE_RESTART))).toBe(true)
  }
})

test("they stack below it, and the controls keep the right edge", async () => {
  for (const width of [...STACKED, ...SHORT]) {
    const captured = await shot(width)
    const page = pageBackground(captured.spans)
    const all = rows(captured.spans, page)
    const sentence = all.find((row) => row.spans.some((span) => span.text.includes(SENTENCE_COPY.slice(0, 24))))
    const copy = control(captured, copyLabel(width))
    const reset = control(captured, RESET)
    const exit = control(captured, EXIT)
    expect(copy).toBeDefined()
    expect(reset).toBeDefined()
    expect(exit).toBeDefined()
    expect(copy!.y).toBeGreaterThan(sentence!.y)
    expect(reset!.y).toBeGreaterThan(sentence!.y)
    // The two controls of the second row are one row, not two.
    expect(exit!.y).toBe(reset!.y)
    // Flush to the frame's right edge: this is the family's action position,
    // not a new paragraph starting under the prose.
    const label = copyLabel(width)
    expect(captured.rows[copy!.y]!.trimEnd().endsWith(label)).toBe(true)
    expect(captured.rows[reset!.y]!.trimEnd().endsWith(EXIT)).toBe(true)
    // And the sentence is not on either of those rows — the fused row.
    expect(captured.rows[copy!.y]!.includes(SENTENCE_COPY.slice(0, 24))).toBe(false)
    expect(captured.rows[reset!.y]!.includes(SENTENCE_RESTART.slice(0, 22))).toBe(false)
  }
})

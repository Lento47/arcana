/** @jsxImportSource @opentui/solid */
/**
 * The picker's defects were only visible once it rendered *inside its host*.
 *
 * `DialogSelect` is not a standalone surface: the dialog body is a scroll
 * viewport capped at `dialogContentMaxHeight`, and three of the picker's
 * problems came from that relationship rather than from the picker alone —
 * an unconstrained root that overflowed the viewport (so the body scrolled as
 * a whole and took the filter row and the action footer below the fold), a
 * `scrollbarOptions={{ visible: true }}` that configured *both* axes and
 * painted a full-width row of block glyphs through the bottom of the list, and
 * a doubled top inset that put two blank rows above the title where every
 * other dialog has one.
 *
 * None of the three is expressible as a unit assertion on the component's own
 * props, so they are pinned here by frame: what the terminal actually shows at
 * a cramped height, and what it must never show.
 */
import { expect, test } from "bun:test"
import { onMount } from "solid-js"
import { testRender } from "@opentui/solid"
import { useDialog } from "../src/ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../src/ui/dialog-select"
import { dialogMaxHeight } from "../src/util/geometry"
import { TestTuiProviders } from "./fixture/tui-providers"

const TITLE = "Choose a model"

const OPTIONS: DialogSelectOption<string>[] = [
  { title: "claude-sonnet-5", value: "a", description: "fast", footer: "Free", category: "Anthropic" },
  { title: "claude-opus-5", value: "b", description: "deep", footer: "Pro", category: "Anthropic" },
  { title: "gpt-5", value: "c", details: ["via openrouter"], category: "OpenAI" },
]

function Opener() {
  const dialog = useDialog()
  onMount(() => {
    dialog.replace(() => (
      <DialogSelect
        title={TITLE}
        placeholder="Scry models…"
        options={OPTIONS}
        current="b"
        footerHints={[
          { title: "enter", label: "select", side: "right" },
          { title: "esc", label: "close", side: "right" },
        ]}
      />
    ))
  })
  return null
}

/** Render the picker at a terminal size and return the settled frame, right-trimmed. */
async function capture(width: number, height: number): Promise<string[]> {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <Opener />
      </TestTuiProviders>
    ),
    { width, height },
  )
  try {
    let lines: string[] = []
    for (let i = 0; i < 80; i++) {
      await Bun.sleep(15)
      await app.renderOnce()
      await app.flush()
      await app.renderOnce()
      lines = app.captureCharFrame().split("\n")
      if (lines.some((line) => line.includes(TITLE))) break
    }
    return lines.map((line) => line.replace(/\s+$/, ""))
  } finally {
    app.renderer.destroy()
  }
}

const rowOf = (lines: string[], needle: string) => lines.findIndex((line) => line.includes(needle))

test("a cramped terminal keeps the picker's footer and its options on screen", async () => {
  const lines = await capture(96, 20)

  // The footer is what the old overflow pushed below the fold: the body scrolled
  // as a whole, so the hints that say how to leave the dialog were unreachable.
  expect(lines.some((line) => line.includes("enter select"))).toBe(true)
  expect(lines.some((line) => line.includes("esc close"))).toBe(true)

  // ...and the list still shows real options rather than collapsing to chrome.
  expect(lines.some((line) => line.includes("claude-sonnet-5"))).toBe(true)
  expect(lines.some((line) => line.includes("Anthropic"))).toBe(true)
})

test("the picker never paints a horizontal scrollbar row", async () => {
  // `scrollbarOptions` configures BOTH axes, so `{ visible: true }` there also
  // turned on the horizontal bar — a run of block glyphs across the list,
  // whatever the content and however short the titles.
  const blockRun = /[▀-▟]{2,}/
  for (const height of [20, 24, 40]) {
    const lines = await capture(96, height)
    const offenders = lines.filter((line) => blockRun.test(line))
    expect(offenders).toEqual([])
  }
})

test("the picker card stays inside the dialog height budget", async () => {
  // The root is capped at the body's own budget so the list wrapper — the only
  // flexible child — absorbs the difference. An uncapped root is what made the
  // host scroll instead of the list.
  const lines = await capture(96, 20)
  const top = rowOf(lines, "╭")
  const bottom = rowOf(lines, "╰")
  expect(top).toBeGreaterThanOrEqual(0)
  expect(bottom).toBeGreaterThan(top)
  expect(bottom - top + 1).toBe(dialogMaxHeight(20))
})

test("the card insets its title by exactly one blank row", async () => {
  // The dialog card already insets its body by one row; a `paddingTop` on the
  // picker's own header stacked a second one above the title.
  const lines = await capture(96, 24)
  const top = rowOf(lines, "╭")
  const title = rowOf(lines, TITLE)
  expect(top).toBeGreaterThanOrEqual(0)
  expect(title).toBe(top + 2)
})

test("groups, descriptions and the current marker all render", async () => {
  const lines = await capture(96, 40)
  const frame = lines.join("\n")

  // Category headers separate the groups, with a blank row between groups.
  expect(frame).toContain("Anthropic")
  expect(frame).toContain("OpenAI")
  // The current option wears the marker; its neighbours do not.
  const marked = lines.filter((line) => line.includes("●"))
  expect(marked).toHaveLength(1)
  expect(marked[0]).toContain("claude-opus-5")
  // Descriptions and details hang off the title column.
  expect(frame).toContain("claude-sonnet-5 fast")
  expect(frame).toContain("via openrouter")
  // The right-aligned footer column is the option's, not the title's.
  expect(lines.some((line) => /Free\s*$/.test(line.replace(/\s*│$/, "")))).toBe(true)
})

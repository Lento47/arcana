/** @jsxImportSource @opentui/solid */
/**
 * D10 follow-up: the picker footer's action rows bound `onMouseUp` but no
 * `onMouseOver`, while the option rows in the same file already hover-focus
 * their target. A mouse operator could therefore fire an action without ever
 * seeing which one the pointer was over.
 *
 * Colour is asserted by comparison rather than by token: the emphasised option
 * row and a hovered action row are painted from the same `theme.primary`
 * through the same renderer, so the second has to reproduce the first exactly
 * however the terminal degrades colour.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { type Renderable } from "@opentui/core"
import { onMount } from "solid-js"
import { useDialog } from "../src/ui/dialog"
import { DialogSelect, type DialogSelectOption } from "../src/ui/dialog-select"
import { TestTuiProviders } from "./fixture/tui-providers"

const ACTION = "Toggle"
const FIRST_OPTION = "hover-row-0"

const OPTIONS: DialogSelectOption<number>[] = [
  { title: FIRST_OPTION, value: 0 },
  { title: "hover-row-1", value: 1 },
  { title: "hover-row-2", value: 2 },
]

function findById(root: Renderable, id: string): Renderable | undefined {
  if (root.id === id) return root
  for (const child of root.getChildren()) {
    const found = findById(child, id)
    if (found) return found
  }
}

type Setup = Awaited<ReturnType<typeof testRender>>

async function settle(app: Setup) {
  for (let attempt = 0; attempt < 80; attempt++) {
    await app.renderOnce()
    const frame = app.captureCharFrame()
    if (frame.includes(FIRST_OPTION) && frame.includes(ACTION)) break
    await Bun.sleep(15)
  }
  // The card measures itself against the viewport across a couple of frames;
  // row coordinates read before it settles are stale.
  await Bun.sleep(80)
  await app.renderOnce()
  const frame = app.captureCharFrame()
  for (const marker of [FIRST_OPTION, ACTION]) expect(frame).toContain(marker)
}

/** Background of one cell, read from the styled frame the renderer produced. */
function bgAt(app: Setup, row: number, col: number) {
  let x = 0
  for (const span of app.captureSpans().lines[row]?.spans ?? []) {
    if (span.width > 0 && col < x + span.width) return span.bg.toInts().join()
    x += span.width
  }
  return undefined
}

function locate(app: Setup, needle: string) {
  const lines = app.captureCharFrame().split("\n")
  const row = lines.findIndex((line) => line.includes(needle))
  return { row, col: row < 0 ? -1 : lines[row]!.indexOf(needle) }
}

test("hovering a footer action highlights it, and clicking it still fires", async () => {
  let triggered = 0

  function Launcher() {
    const dialog = useDialog()
    onMount(() =>
      dialog.replace(() => (
        <DialogSelect
          title="Hover picker"
          options={OPTIONS}
          actions={[
            {
              command: "dialog.mcp.toggle",
              title: ACTION,
              onTrigger: () => {
                triggered += 1
              },
            },
          ]}
        />
      )),
    )
    return null
  }

  const app = await testRender(
    () => (
      <TestTuiProviders>
        <Launcher />
      </TestTuiProviders>
    ),
    { width: 120, height: 40, useMouse: true, enableMouseMovement: true },
  )

  try {
    await settle(app)

    // Real pointer movement first: the picker only honours hover once the mouse
    // is the active input, and the option row is what marks it so.
    const option = findById(app.renderer.root, "ds-opt-0")
    expect(option).toBeDefined()
    await app.mockMouse.moveTo(option!.x + 3, option!.y)
    await app.renderOnce()

    const action = locate(app, ACTION)
    const selected = locate(app, FIRST_OPTION)
    const emphasise = bgAt(app, selected.row, selected.col)
    expect(emphasise).toBeDefined()
    expect(bgAt(app, action.row, action.col)).not.toBe(emphasise)

    await app.mockMouse.moveTo(action.col + 1, action.row)
    await app.renderOnce()

    const hovered = locate(app, ACTION)
    expect(bgAt(app, hovered.row, hovered.col)).toBe(emphasise)

    await app.mockMouse.click(hovered.col + 1, hovered.row)
    await app.renderOnce()
    expect(triggered).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})

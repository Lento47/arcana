/** @jsxImportSource @opentui/solid */
/**
 * The workspace retry card — rendered contract.
 *
 * `openWorkspaceSelect` swaps the picker for this card when adapter discovery
 * fails, and it was the last dialog in the family still hand-rolling its
 * actions: a filled `Retry` box with its own padding 3 sitting to the LEFT of a
 * plain `Cancel` text, no focus state, and both verbs typed into the component.
 * So the one button an operator needs here was the one button that did not look
 * like the app's. It now renders through `DialogFooter` / `DialogButton`.
 *
 * Pinned by frame and by span colors: the focused action carries the family's
 * accent fill and derived ink, the dismiss is unfilled, the primary action is
 * last in the row, and both are still pressable.
 */
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { onMount } from "solid-js"
import { MouseButton } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { useDialog } from "../src/ui/dialog"
import { DialogWorkspaceError } from "../src/component/dialog-workspace-create"
import { fallbackTheme, selectedForeground } from "../src/theme"
import { TestTuiProviders } from "./fixture/tui-providers"

const FAILED = "Failed to load workspace adapters"

type App = Awaited<ReturnType<typeof testRender>>
type Span = { text: string; fg: unknown; bg: unknown }

/** RGBA spans arrive as an indexed 4-byte buffer, not as floats. */
function ints(color: unknown): number[] | undefined {
  const buffer = (color as { buffer?: Record<number, number> } | undefined)?.buffer
  if (!buffer) return undefined
  return [buffer[0]!, buffer[1]!, buffer[2]!, buffer[3]!]
}

function spanExact(app: App, text: string): Span | undefined {
  return app
    .captureSpans()
    .lines.flatMap((line) => line.spans)
    .filter((span) => span.text.trim().length > 0)
    .find((span) => span.text.trim() === text)
}

function rowWith(app: App, needle: string): { text: string; y: number } {
  const y = app
    .captureCharFrame()
    .split("\n")
    .findIndex((line) => line.includes(needle))
  expect(y).toBeGreaterThanOrEqual(0)
  return { text: app.captureCharFrame().split("\n")[y]!, y }
}

function Opener(props: { onRetry: () => void }) {
  const dialog = useDialog()
  onMount(() => dialog.replace(() => <DialogWorkspaceError onRetry={props.onRetry} />))
  return null
}

async function renderCard(onRetry: () => void) {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <Opener onRetry={onRetry} />
      </TestTuiProviders>
    ),
    { width: 120, height: 40, useMouse: true, enableMouseMovement: true },
  )
  for (let attempt = 0; attempt < 50 && app.renderer.root.getChildren().length === 0; attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
  }
  // Let the entry wash rise so the card's surface is its final paint.
  for (let attempt = 0; attempt < 6; attempt++) {
    await Bun.sleep(30)
    await app.renderOnce()
  }
  return app
}

test("the retry card renders both actions in the shared footer row", async () => {
  const app = await renderCard(() => {})
  try {
    const theme = fallbackTheme("dark")
    expect(app.captureCharFrame()).toContain(FAILED)

    // The focused action is the accent fill with ink derived for it; the dismiss
    // beside it is unfilled, i.e. the card's own surface.
    expect(ints(spanExact(app, "Retry")?.bg)).toEqual(theme.primary.toInts())
    expect(ints(spanExact(app, "Retry")?.fg)).toEqual(selectedForeground(theme).toInts())
    expect(ints(spanExact(app, "Cancel")?.bg)).toEqual(theme.backgroundPanel.toInts())

    // One row, primary action last, flush against the card's right edge — the
    // family shape. The hand-rolled row put the filled Retry box first and left
    // a plain Cancel text hanging off the end of it.
    const row = rowWith(app, "Retry").text
    expect(row).toContain("Cancel")
    expect(row.indexOf("Cancel")).toBeLessThan(row.indexOf("Retry"))
    expect(row).toMatch(/Cancel\s+Retry\s+│/)
  } finally {
    app.renderer.destroy()
  }
})

test("both actions stay pressable", async () => {
  let retries = 0
  const app = await renderCard(() => {
    retries++
  })
  try {
    const row = rowWith(app, "Retry")
    await app.mockMouse.click(row.text.indexOf("Retry"), row.y, MouseButton.LEFT)
    await app.renderOnce()
    expect(retries).toBe(1)

    await app.mockMouse.click(row.text.indexOf("Cancel"), row.y, MouseButton.LEFT)
    await app.renderOnce()
    expect(app.captureCharFrame()).not.toContain(FAILED)
  } finally {
    app.renderer.destroy()
  }
})

const SRC = join(import.meta.dir, "../src")

/** Source with comments stripped — this file documents the conventions it follows. */
function readCode(rel: string) {
  return readFileSync(join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
}

test("the retry card's actions come from the shared anatomy", () => {
  const source = readCode("component/dialog-workspace-create.tsx")
  expect(source).toContain("<DialogFooter>")
  expect(source).toContain("<DialogButton")
  // The bespoke row and the verbs typed into it are gone — DialogButton owns the
  // fill, padding and ink, and the copy comes from the brand layer.
  expect(source).not.toContain("paddingLeft={3}")
  expect(source).not.toContain('"Retry"')
  expect(source).not.toContain('"Cancel"')
})

test("the discovery failure is reported from one source", () => {
  const source = readCode("component/dialog-workspace-create.tsx")
  // Toast title and card heading are the same user-visible sentence; a second
  // literal is a second thing to forget when the wording changes.
  expect(source.match(new RegExp(FAILED, "g"))).toHaveLength(1)
})

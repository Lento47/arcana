/** @jsxImportSource @opentui/solid */
/**
 * Generic tool output that arrived as JSON, rendered.
 *
 * `GenericTool` formats arbitrary tool output: an array of flat objects becomes
 * a table, a flat object becomes a `key: value` block. Both had the same defect
 * — a layout that was never measured against the pane it was drawn in.
 *
 * The table's cells were `width = max(8, floor(pane / columns))`, which ignores
 * the two-column gutter between columns (a five-column table overran its pane by
 * eight columns) and floors at eight, which is not a fit on a narrow pane
 * either. The cells also kept the default `wrapMode="word"`, so a value longer
 * than its column wrapped and grew its row: the record beside it was then read
 * at the wrong height, which is a table that is no longer a table.
 *
 * The key-value block had no key column at all — each key was its own intrinsic
 * width, so the values started at a different column on every line.
 *
 * These tests are the file's first. They assert the geometry that was missing:
 * every record is exactly one row, the columns line up with the gutter the
 * budget paid for, and a value that does not fit reads as cut (`…`) rather than
 * as short.
 *
 * The harness is the real `ProviderTree` (as `composer-render` uses) rather than
 * the lighter fixture: the theme and KV providers gate their children behind a
 * ready flag that only settles against a real state directory, so a lighter
 * chain renders a blank frame instead of failing.
 */
import { expect, test } from "bun:test"
import { testRender, useRenderer } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { onCleanup, type ParentProps } from "solid-js"
import { Path as GlobalPath } from "@arcana/core/global"
import { ProviderTree } from "../src/provider-tree"
import { createPluginRuntime } from "../src/plugin/runtime"
import { registerOpencodeKeymap } from "../src/keymap"
import {
  TABLE_GAP,
  ToolOutputFields,
  ToolOutputTable,
  kvKeyWidth,
  tableCellWidth,
} from "../src/routes/session/tool-parts"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

/** Where `needle` is drawn. `row` is -1 when the text is absent. */
function at(frame: string, needle: string) {
  const lines = frame.split("\n")
  const row = lines.findIndex((line) => line.includes(needle))
  return { row, col: row === -1 ? -1 : lines[row]!.indexOf(needle) }
}

function Harness(props: ParentProps) {
  const renderer = useRenderer()
  const calls = createFetch()
  const events = createEventSource()
  const resolvedConfig = createTuiResolvedConfig()
  const keymap = createDefaultOpenTuiKeymap(renderer)
  onCleanup(registerOpencodeKeymap(keymap, renderer, resolvedConfig))
  return (
    <ProviderTree
      mode="dark"
      global={GlobalPath}
      keymap={keymap}
      pluginRuntime={createPluginRuntime()}
      config={resolvedConfig}
      args={{} as any}
      url="http://test"
      directory={directory}
      fetch={calls.fetch}
      events={events.source}
      onExit={() => {}}
      setEpilogue={() => {}}
    >
      <box flexDirection="column" width="100%" height="100%">
        {props.children}
      </box>
    </ProviderTree>
  )
}

/** Render, settle, and capture the frame the tree converged on. */
async function shot(node: () => unknown, width = 60, height = 20) {
  const app = await testRender(node as never, { width, height })
  let frame = ""
  for (let attempt = 0; attempt < 30; attempt++) {
    await app.renderOnce()
    await app.flush()
    const next = app.captureCharFrame()
    if (next.trim().length > 0 && next === frame) break
    frame = next
    await Bun.sleep(30)
  }
  return { app, frame }
}

test("a table cell's budget pays for its own gutters", () => {
  // The row is the width it was given, not that width plus the gutters between
  // its columns — the whole reason the old budget overran the pane.
  for (const columns of [2, 3, 5]) {
    for (const width of [40, 60, 100, 200]) {
      const cell = tableCellWidth(width, columns)
      expect(columns * cell + TABLE_GAP * (columns - 1)).toBeLessThanOrEqual(width)
    }
  }

  // Degenerate panes stay non-negative and non-zero; a cell is never a hole.
  expect(tableCellWidth(Number.NaN, 3)).toBe(1)
  expect(tableCellWidth(0, 3)).toBe(1)
  expect(tableCellWidth(60, 0)).toBe(60)
})

test("a table draws one row per record and lines its columns up", async () => {
  const { app, frame } = await shot(() => (
    <Harness>
      <ToolOutputTable
        width={60}
        columns={["file", "status", "note"]}
        rows={[
          { file: "src/index.ts", status: "modified", note: "adds the banner" },
          { file: "src/util/geometry.ts", status: "added", note: "x".repeat(200) },
          { file: "test/zz.test.ts", status: "deleted", note: "gone" },
        ]}
      />
    </Harness>
  ))
  try {
    // Three records, three consecutive rows — nothing wrapped its way taller.
    // The second file name is longer than its column, so it is the elided form
    // that has to be found: a cell cut mid-name is still one row tall.
    const first = at(frame, "src/index.ts")
    const second = at(frame, "src/util/geometry…")
    const third = at(frame, "test/zz.test.ts")
    expect(first.row).toBeGreaterThan(-1)
    expect(second.row).toBe(first.row + 1)
    expect(third.row).toBe(second.row + 1)

    // Every column starts where the budget said it would.
    const cell = tableCellWidth(60, 3)
    expect(at(frame, "modified").col).toBe(first.col + cell + TABLE_GAP)
    expect(at(frame, "added").col).toBe(first.col + cell + TABLE_GAP)
    expect(at(frame, "deleted").col).toBe(first.col + cell + TABLE_GAP)

    // 200 columns of note in an 18-column cell: elided to the column, and the
    // elision is visible, so a cut value cannot be mistaken for the whole value.
    expect(frame).toContain(`${"x".repeat(cell - 1)}…`)
    expect(frame).not.toContain("x".repeat(cell))

    // No line is wider than the pane it was drawn in.
    for (const line of frame.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(60)
    }
  } finally {
    app.renderer.destroy()
  }
})

test("a table accounts for the rows it did not draw", async () => {
  const { app, frame } = await shot(() => (
    <Harness>
      <ToolOutputTable
        width={60}
        columns={["id", "state"]}
        rows={Array.from({ length: 23 }, (_, index) => ({ id: `row-${index}`, state: "ok" }))}
      />
    </Harness>
  ))
  try {
    // The tool's own badge counts every row, so a table that stops at twenty
    // has to say so or the two readouts disagree.
    expect(at(frame, "row-19").row).toBeGreaterThan(-1)
    expect(at(frame, "row-20").row).toBe(-1)
    expect(frame).toContain("… 3 more rows")
  } finally {
    app.renderer.destroy()
  }
})

test("a key-value block aligns its values under one column, whatever the key lengths", async () => {
  const { app, frame } = await shot(() => (
    <Harness>
      <ToolOutputFields
        width={60}
        entries={[
          ["name", "index.ts"],
          ["veryLongConfigurationKey", "true"],
          ["mode", "read-write"],
        ]}
      />
    </Harness>
  ))
  try {
    const keyWidth = kvKeyWidth(["name", "veryLongConfigurationKey", "mode"], 60)
    const key = at(frame, "name:")
    expect(key.row).toBeGreaterThan(-1)
    // Every value starts at the same column: the key column is fixed, and short
    // keys hold it open for long ones instead of collapsing it.
    expect(at(frame, "index.ts").col).toBe(key.col + keyWidth + 1)
    expect(at(frame, "true").col).toBe(key.col + keyWidth + 1)
    expect(at(frame, "read-write").col).toBe(key.col + keyWidth + 1)

    // A key too wide for its column is cut, not wrapped onto the value's line.
    expect(at(frame, "veryLongConfigurationKey").col).toBe(-1)
    expect(at(frame, "veryLongConfiguratio").row).toBe(at(frame, "true").row)
  } finally {
    app.renderer.destroy()
  }
})

/** @jsxImportSource @opentui/solid */
/**
 * Each patch file leads with a header row: the path, and its two counts pinned
 * right. That row is one row, at every pane width.
 *
 * The path is a single token with no spaces, and the row is `flexShrink={0}`,
 * so an overrun did not clip — it wrapped mid-name, splitting
 * `packages/tui/src/feature-plugins/system/diff-viewer.tsx` into a first row
 * carrying the counts and a stray tail row below it. A header that grows is not
 * only ugly here: every patch row below it is positioned from its measured `y`,
 * so each extra header row moves the target of a click-to-scroll into the file.
 *
 * The header now elides from the left with `elidePath` — the filename is what
 * tells two headers apart, the directories are what they have in common — and
 * carries `wrapMode="none"`, so the worst case is a clip rather than a second
 * row. The diff viewer had no render test at all before this one.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TuiPluginApi, TuiPluginMeta } from "@arcana/plugin/tui"
import { createTuiPluginApi } from "./fixture/tui-plugin"
import { TestTuiProviders } from "./fixture/tui-providers"
import diffViewerPlugin from "../src/feature-plugins/system/diff-viewer"

const pluginMeta = {
  id: "diff-viewer",
  source: "internal",
  spec: "diff-viewer",
  target: "diff-viewer",
  first_time: 0,
  last_time: 0,
  time_changed: 0,
  load_count: 1,
  fingerprint: "test",
  state: "same",
} satisfies TuiPluginMeta

const LONG_FILE = "packages/tui/src/feature-plugins/system/diff-viewer.tsx"
const SHORT_FILE = "packages/tui/src/util/geometry.ts"

const PATCH = ["@@ -1,3 +1,4 @@", " context", "-removed", "+added", "+more"].join("\n")

const FILES = [
  { file: LONG_FILE, patch: PATCH, additions: 12, deletions: 3, status: "modified" as const },
  { file: SHORT_FILE, patch: PATCH, additions: 4, deletions: 1, status: "modified" as const },
]

/** Mounts the plugin's registered `diff` route with a stubbed diff result. */
async function mountDiffViewer(width: number) {
  let view: (() => unknown) | undefined
  const base = createTuiPluginApi()
  const api = {
    ...base,
    client: {
      vcs: { diff: async () => ({ data: FILES }) },
      session: { diff: async () => ({ data: FILES }) },
    },
    keymap: { registerLayer: () => () => {} },
    route: {
      current: { name: "diff", params: { mode: "git" } },
      register(routes: ReadonlyArray<{ render: () => unknown }>) {
        view = routes[0]!.render
        return () => {}
      },
      navigate() {},
    },
    state: { ...(base.state as Record<string, unknown>), session: { get: () => undefined } },
  } as unknown as TuiPluginApi

  await diffViewerPlugin.tui(api, undefined, pluginMeta)
  if (!view) throw new Error("diff viewer registered no route")

  const app = await testRender(() => <TestTuiProviders>{view!() as never}</TestTuiProviders>, {
    width,
    height: 24,
  })
  for (let attempt = 0; attempt < 40; attempt++) {
    await Bun.sleep(15)
    await app.renderOnce()
  }
  return app
}

function rows(frame: string): string[] {
  return frame.split("\n").filter((line) => line.trim().length > 0)
}

test("a file header stays one row with its counts when the path is longer than the pane", async () => {
  // 60 columns is well inside the range where the patch pane is narrower than
  // this path: the file tree is hidden below 100, so the pane is 56 here.
  const app = await mountDiffViewer(60)
  try {
    const lines = rows(app.captureCharFrame())
    const header = lines.find((line) => line.includes("+12"))
    expect(header).toBeDefined()
    // The counts belong to the same row as the name they count. Before the fix
    // this row held the counts and the *head* of the path, and the tail
    // (`diff-viewer.tsx`) sat on a row of its own with the counts already gone.
    expect(header).toContain("-3")
    expect(header).toContain("diff-viewer.tsx")
    // Elided from the left, so the leaf survives and the head does not.
    expect(header).toContain("…/")
    expect(header).not.toContain("packages/tui/src")
    // No orphaned fragment of the path anywhere in the frame.
    expect(lines.some((line) => line.trim() === "diff-viewer.tsx")).toBe(false)
  } finally {
    app.renderer.destroy()
  }
})

test("the second file's header is drawn too, and the patch below it is untouched", async () => {
  const app = await mountDiffViewer(60)
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("+4")
    expect(frame).toContain("geometry.ts")
    // The header row is chrome; the hunks under it are the payload.
    expect(frame).toContain("@@ -1,3 +1,4 @@")
  } finally {
    app.renderer.destroy()
  }
})

test("a pane wide enough for the whole path shows the whole path", async () => {
  const app = await mountDiffViewer(200)
  try {
    const lines = rows(app.captureCharFrame())
    const header = lines.find((line) => line.includes("+12"))
    expect(header).toContain(LONG_FILE)
    expect(header).not.toContain("…")
    expect(header).toContain("-3")
  } finally {
    app.renderer.destroy()
  }
})

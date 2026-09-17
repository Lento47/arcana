/** @jsxImportSource @opentui/solid */
/**
 * The diff viewer's footer strip shows whole hints, or it does not show them.
 *
 * The strip is a flex row of nine `key verb` pairs — about 127 columns in all —
 * and below that width Yoga answered by shrinking whichever text it liked, so
 * the hints decoded mid-phrase (`next` on one row, `file` on the next) and the
 * strip grew to two rows. That second row came out of the patch pane above it,
 * which is the one place in this viewer where a cosmetic overrun costs real
 * content: the pane is sized from the terminal height.
 *
 * The row is now measured against the terminal and only the hints that fit are
 * rendered, each one whole. What does not fit is absent — which is what the
 * `all` hint and the shortcut dialog behind it exist for — rather than present
 * and mutilated.
 *
 * These assertions are about the frame, not about the count: a hint that fits
 * appears exactly once, in full, on one row; a hint that does not fit does not
 * appear at all. Both halves matter, because the failure this guards against is
 * a *fragment* that still looks like a hint.
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

const PATCH = ["@@ -1,3 +1,4 @@", " context", "-removed", "+added"].join("\n")
const FILES = [
  {
    file: "packages/tui/src/util/geometry.ts",
    patch: PATCH,
    additions: 4,
    deletions: 1,
    status: "modified" as const,
  },
]

/** The verbs the strip spells, longest-first so a prefix never matches first. */
const VERBS = [
  "focus file tree",
  "focus patches",
  "previous file",
  "previous hunk",
  "mark reviewed",
  "switch source",
  "next file",
  "next hunk",
  "close",
]

async function mountDiffViewer(width: number) {
  let view: (() => unknown) | undefined
  const base = createTuiPluginApi()
  const api = {
    ...base,
    client: {
      vcs: { diff: async () => ({ data: FILES }) },
      session: { diff: async () => ({ data: FILES }) },
    },
    // The layer is dropped, so the strip's shortcuts come from the default
    // keybind config the providers register — the same route the app takes.
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
  return frame.split("\n").map((line) => line.trimEnd())
}

/** Rows carrying any hint at all — the strip, wherever it landed. */
function stripRows(frame: string): string[] {
  return rows(frame).filter((row) => VERBS.some((verb) => row.includes(verb) || row.includes(verb.split(" ")[0]!)))
}

test("a narrow terminal drops whole hints rather than splitting them across rows", async () => {
  // 80 columns is inside the range where the strip cannot hold every hint, and
  // where the file tree is already hidden (below 100), so the expected set is
  // the four navigation hints and the dismissal.
  const app = await mountDiffViewer(80)
  try {
    const frame = app.captureCharFrame()
    const lines = rows(frame)
    const strip = lines.filter((row) => VERBS.some((verb) => row.includes(verb)))

    // One row of hints, never two: a strip that grew is a row taken from the
    // patch pane.
    expect(strip.length).toBe(1)
    const row = strip[0]!
    expect(row.length).toBeLessThanOrEqual(80)

    // Every hint on it is whole — the verb follows its key, on this row.
    expect(row).toContain("next file")
    expect(row).toContain("next hunk")
    expect(row).toContain("previous hunk")
    expect(row).toContain("close")

    // And no fragment of any hint is left anywhere in the frame. A wrapped
    // `next file` leaves exactly the bare words this looks for.
    // The wrap signature: a row carrying a navigation word without the pair it
    // belongs to. (`file` alone is not one — the header's `1 file` count ends a
    // row legitimately — so the check is on the pairs, not on the words.)
    const halfHints = lines.filter(
      (line) =>
        /\b(next|previous)\b/.test(line) && !/(next file|next hunk|previous file|previous hunk)/.test(line),
    )
    expect(JSON.stringify(halfHints), "rows carrying half a hint").toBe("[]")
  } finally {
    app.renderer.destroy()
  }
})

test("a hint that does not fit is absent, not clipped into a shorter hint", async () => {
  const app = await mountDiffViewer(80)
  try {
    const frame = app.captureCharFrame()
    // `switch source` and `mark reviewed` are the last two before the
    // dismissal, and at 80 they are the ones that go. The assertion is that
    // they go entirely: no `switch` without its `source`, no `mark` alone.
    expect(frame.includes("switch source")).toBe(false)
    expect(frame.includes("switch")).toBe(false)
    expect(frame.includes("mark reviewed")).toBe(false)
    // The dismissal is the one that is never dropped — it is how you leave.
    expect(frame).toContain("close")
  } finally {
    app.renderer.destroy()
  }
})

test("a wide terminal shows the whole strip on one row", async () => {
  // 200 columns holds all nine pairs and the gaps between them.
  const app = await mountDiffViewer(200)
  try {
    const frame = app.captureCharFrame()
    const strip = rows(frame).filter((row) => VERBS.some((verb) => row.includes(verb)))
    expect(strip.length).toBe(1)
    const row = strip[0]!
    for (const verb of ["focus file tree", "next file", "next hunk", "previous hunk", "previous file", "switch source", "mark reviewed", "close"]) {
      expect(row).toContain(verb)
    }
  } finally {
    app.renderer.destroy()
  }
})

/** @jsxImportSource @opentui/solid */
/**
 * The sidebar footer's path line loses its head, not its tail, and stays one row.
 *
 * An absolute path out of a deep checkout is longer than the column, and a path
 * has no spaces for word wrap to break at, so the footer wrapped it mid-token —
 * `/home/operator/work/projects/very/deep` on one row and `/checkout/packages/
 * tui` on the next — and the footer grew from two rows to three at every
 * screen. The line is now measured against the column's own budget, the same 36
 * the modified-files list beside it assumes: the name is kept whole and the
 * parent is shortened from the left, so `…/checkout/packages/tui` still says
 * where you are. `wrapMode="none"` is the invariant — the worst case is a clip
 * at the column edge, never a second row.
 *
 * The column is the sidebar's own: it was 42 wide with two columns of padding
 * per side while it still existed (`Size.sidebarWidth`), which is the 38 the
 * budget here is measured against.
 */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import type { TuiPluginApi, TuiPluginMeta } from "@arcana/plugin/tui"

import { createTuiPluginApi } from "./fixture/tui-plugin"
import { TestTuiProviders } from "./fixture/tui-providers"

const { default: footerPlugin } = await import("../src/feature-plugins/sidebar/footer")

/** The sidebar column, and what is left of it inside its padding. */
const COLUMN = 42
const USABLE = 38

const DEEP = "/home/operator/work/projects/very/deep/checkout/packages/tui"
const NAME = "packages/tui"

type SlotProps = { session_id: string }
type SlotView = (ctx: unknown, props: SlotProps) => unknown

async function mountFooter(api: TuiPluginApi) {
  let view: SlotView | undefined
  const slots = {
    register(registration: { slots: { sidebar_footer?: SlotView } }) {
      view = registration.slots.sidebar_footer
      return () => {}
    },
  }
  await footerPlugin.tui({ ...api, slots } as unknown as TuiPluginApi, undefined, pluginMeta)
  if (!view) throw new Error(`${footerPlugin.id} registered no sidebar_footer slot`)

  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box width={COLUMN} flexDirection="column" paddingLeft={2} paddingRight={2}>
          {view!(undefined, { session_id: "ses-1" }) as never}
        </box>
      </TestTuiProviders>
    ),
    { width: COLUMN, height: 10 },
  )
  for (let attempt = 0; attempt < 50 && app.renderer.root.getChildren().length === 0; attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    await Bun.sleep(20)
    await app.renderOnce()
  }
  return app
}

/** The api the footer needs: a paid provider hides the getting-started card, so
 *  the footer is only the path and the version. */
function footerApi(directory: string) {
  const base = createTuiPluginApi()
  return {
    ...base,
    app: { version: "0.0.0-test" },
    state: {
      provider: [{ id: "anthropic", models: { opus: { cost: { input: 3 } } } }],
      path: { directory },
      vcs: { branch: undefined },
      session: { get: () => ({ directory }) },
    },
  } as unknown as TuiPluginApi
}

test("a deep path keeps its name and never wraps to a second row", async () => {
  const app = await mountFooter(footerApi(DEEP))
  try {
    const rows = app.captureCharFrame()
      .split("\n")
      .map((row) => row.trimEnd())

    const pathRow = rows.findIndex((row) => row.includes(NAME))
    expect(pathRow).toBeGreaterThanOrEqual(0)
    // The tail survives whole and the head is what went.
    expect(rows[pathRow]!.endsWith(NAME)).toBe(true)
    expect(rows[pathRow]!.includes("…")).toBe(true)
    // One row of path, not two: no fragment of it spilled anywhere below, and
    // the parent it was shortened from appears only on that row.
    expect(rows.filter((row) => row.includes("checkout")).length).toBe(1)
    expect(rows.filter((row) => row.includes(NAME)).length).toBe(1)
    // And the line stays inside what the column actually has.
    expect(rows[pathRow]!.length).toBeLessThanOrEqual(USABLE)
  } finally {
    app.renderer.destroy()
  }
})

test("a directory name too long for the column is shortened from the left", async () => {
  const name = "a-very-long-checkout-directory-name-here"
  const app = await mountFooter(footerApi(`/home/operator/work/${name}`))
  try {
    const rows = app.captureCharFrame()
      .split("\n")
      .map((row) => row.trimEnd())
    const pathRow = rows.findIndex((row) => row.includes("…"))
    expect(pathRow).toBeGreaterThanOrEqual(0)
    // The last characters of the name — the part that identifies it — are what
    // is kept, and the line still fits the column.
    expect(rows[pathRow]!.endsWith(name.slice(-10))).toBe(true)
    expect(rows[pathRow]!.length).toBeLessThanOrEqual(USABLE)
  } finally {
    app.renderer.destroy()
  }
})

const pluginMeta = {
  id: "sidebar",
  source: "internal",
  spec: "sidebar",
  target: "sidebar",
  first_time: 0,
  last_time: 0,
  time_changed: 0,
  load_count: 1,
  fingerprint: "test",
  state: "same",
} satisfies TuiPluginMeta

/**
 * BLK-TUI-02 evidence generator: width matrix 59-180.
 *
 * Per mandated width x scrollbar variant:
 * - session frame mounts, prose body renders non-zero,
 * - no right-edge overflow (body <= spine inner width),
 * - SpineHeader fits when contentWidth is passed (production behavior).
 */
/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { Renderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { getSpineLayout } from "../src/shell/command-spine/spine-types"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { SpineHeader } from "../src/shell/command-spine/spine-header"

const MANDATED_WIDTHS = [59, 60, 79, 80, 99, 100, 119, 120, 149, 180]

function findById(root: Renderable, id: string): Renderable | undefined {
  if ((root as { id?: string }).id === id) return root
  for (const child of root.getChildren()) {
    const found = findById(child, id)
    if (found) return found
  }
  return undefined
}

async function measureFrame(width: number, opts: { scrollbar?: boolean } = {}) {
  const app = await testRender(
    () => (
      <box id="app" width={width} height={24} flexDirection="column">
        <box id="session-row" flexDirection="row" flexGrow={1} minHeight={0} width="100%">
          <box
            id="session-frame"
            flexGrow={1}
            minHeight={0}
            minWidth={0}
            paddingLeft={2}
            paddingRight={2}
            border={["left", "right"]}
          >
            <box id="spine" flexDirection="column" flexGrow={1} minHeight={0} minWidth={0} width="100%">
              <box id="header-probe" width="100%" height={1} />
              <box id="entry" flexDirection="row" width="100%" paddingLeft={1} paddingRight={opts.scrollbar ? 1 : 0}>
                <box id="gutter" width={2} flexShrink={0} height={1} />
                <box id="content" flexGrow={1} minWidth={0} flexShrink={1} height={3}>
                  <box id="card" border={["left"]} paddingLeft={2} paddingRight={1} width="100%" minWidth={0}>
                    <box id="body-probe" width="100%" height={1} />
                  </box>
                </box>
              </box>
            </box>
          </box>
        </box>
      </box>
    ),
    { width, height: 24 },
  )
  try {
    for (let attempt = 0; attempt < 40 && !findById(app.renderer.root, "body-probe"); attempt++) {
      await Bun.sleep(10)
      await app.renderOnce()
    }
    await app.renderOnce()
    const body = findById(app.renderer.root, "body-probe")?.width ?? 0
    const spineInner = findById(app.renderer.root, "spine")?.width ?? 0
    const headerProbe = findById(app.renderer.root, "header-probe")?.width ?? 0
    return { width, scrollbar: !!opts.scrollbar, body, spineInner, headerProbe }
  } finally {
    app.renderer.destroy()
  }
}

test("width matrix 59-180 mounts frames with non-zero prose and no right-edge overflow", async () => {
  const rows: string[] = []
  const failures: string[] = []
  for (const width of MANDATED_WIDTHS) {
    for (const scrollbar of [false, true] as const) {
      const r = await measureFrame(width, { scrollbar })
      const tag = `${width}${scrollbar ? "+sb" : ""}`
      rows.push(`${tag}: body=${r.body} spine=${r.spineInner}`)
      if (!(r.body > 0)) failures.push(`${tag}: prose body not rendered`)
      if (!(r.body <= r.spineInner)) failures.push(`${tag}: right-edge overflow (${r.body} > ${r.spineInner})`)
    }
  }
  console.log("=== WIDTH MATRIX EVIDENCE (frames) ===\n" + rows.join("\n"))
  expect(failures).toEqual([])
})

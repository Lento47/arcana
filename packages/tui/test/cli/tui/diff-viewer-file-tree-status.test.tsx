/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { JSX } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { KVProvider } from "../../../src/context/kv"
import { ThemeProvider } from "../../../src/context/theme"
import { ToastProvider } from "../../../src/ui/toast"
import { TuiConfigProvider } from "../../../src/config"
import { DiffViewerFileTree } from "../../../src/feature-plugins/system/diff-viewer-file-tree"
import { TestTuiContexts } from "../../fixture/tui-environment"

const theme = {
  background: RGBA.fromHex("#000000"),
  backgroundPanel: RGBA.fromHex("#111111"),
  backgroundElement: RGBA.fromHex("#333333"),
  primary: RGBA.fromHex("#00ffff"),
  secondary: RGBA.fromHex("#0088ff"),
  selectedListItemText: RGBA.fromHex("#ffffff"),
  text: RGBA.fromHex("#ffffff"),
  textMuted: RGBA.fromHex("#888888"),
  error: RGBA.fromHex("#ff0000"),
}

const files = [{ file: "src/config/tui.ts" }]

describe("DiffViewerFileTree status copy", () => {
  test("the pane reports in-flight and failed states instead of blanking", async () => {
    const loading = await renderFrame(() => (
      <DiffViewerFileTree width={32} files={files} loading={true} error={undefined} theme={theme} />
    ))
    const failed = await renderFrame(() => (
      <DiffViewerFileTree width={32} files={files} loading={false} error={new Error("nope")} theme={theme} />
    ))

    expect(loading).toContain("Working…")
    expect(loading).not.toContain("Working...")
    expect(failed).toContain("Failed to load files")
    expect(failed).toContain("the viewer to retry")
    expect(failed).not.toContain("Failed to load diff")
  })

  test("a settled load keeps the file rows and the empty state", async () => {
    const rows = await renderFrame(() => (
      <DiffViewerFileTree width={32} files={files} loading={false} error={undefined} theme={theme} />
    ))
    const empty = await renderFrame(() => (
      <DiffViewerFileTree width={32} files={[]} loading={false} error={undefined} theme={theme} />
    ))

    expect(rows).toContain("tui.ts")
    expect(rows).not.toContain("Working…")
    expect(empty).toContain("No files changed")
  })
})

async function renderFrame(component: () => JSX.Element) {
  const app = await testRender(() => withTheme(component), { width: 40, height: 10 })
  try {
    await renderOnceSettled(app)
    return await captureSettledFrame(app)
  } finally {
    app.renderer.destroy()
  }
}

async function renderOnceSettled(app: Awaited<ReturnType<typeof testRender>>) {
  await app.renderOnce()
  await new Promise((resolve) => setTimeout(resolve, 25))
  await app.renderOnce()
}

async function captureSettledFrame(app: Awaited<ReturnType<typeof testRender>>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const frame = app.captureCharFrame()
    if (frame.trim().length > 0) return frame
    await new Promise((resolve) => setTimeout(resolve, 25))
    await app.renderOnce()
  }
  return app.captureCharFrame()
}

function withTheme(component: () => JSX.Element) {
  return (
    <TestTuiContexts>
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVProvider>
          <ToastProvider>
            <ThemeProvider mode="dark">{component()}</ThemeProvider>
          </ToastProvider>
        </KVProvider>
      </TuiConfigProvider>
    </TestTuiContexts>
  )
}

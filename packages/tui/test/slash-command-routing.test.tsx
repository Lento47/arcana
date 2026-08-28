/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { afterEach, describe, expect, test } from "bun:test"
import { onCleanup } from "solid-js"
import { buildAppCommands } from "../src/app-commands"
import diffViewerPlugin from "../src/feature-plugins/system/diff-viewer"
import { resolvePaletteSlashCommand } from "../src/keymap"

function appDeps() {
  return {
    dialog: { replace() {}, clear() {}, setSize() {} },
    sync: {
      data: { session: [], console_state: { switchableOrgCount: 0 } },
      session: { get() {}, refresh: async () => {} },
    },
    local: {
      agent: { current() {}, list() {}, set() {}, move() {} },
      model: {
        current() {},
        cycle() {},
        cycleFavorite() {},
        variant: { list() { return [] }, current() {}, cycle() {} },
      },
    },
    kv: { get(_key: string, fallback?: unknown) { return fallback }, set() {} },
    route: { data: { type: "home" }, navigate() {} },
    sdk: { client: {} },
    toast: { show() {}, error() {} },
    renderer: {} as any,
    exit() {},
    clipboard: {},
    pluginHost: {},
    currentWorktreeWorkspace: () => undefined,
    connected: () => false,
    mlRuntimeEnabled: () => false,
    setMlRuntimeEnabled: () => {},
    terminalTitleEnabled: () => false,
    setTerminalTitleEnabled: () => {},
    pasteSummaryEnabled: () => true,
    setPasteSummaryEnabled: () => {},
    mode: () => "dark",
    setMode: () => {},
    locked: () => false,
    lock() {},
    unlock() {},
  } as any
}

describe("palette slash routing", () => {
  let renderer: { destroy(): void } | undefined

  afterEach(() => {
    renderer?.destroy()
    renderer = undefined
  })

  test("keeps /soul and /diff registered in the palette namespace", async () => {
    let resolved: { soul?: string; diff?: string } = {}
    let soulOpened = false
    let diffOpened = false

    function Harness() {
      const currentRenderer = useRenderer()
      renderer = currentRenderer
      const keymap = createDefaultOpenTuiKeymap(currentRenderer)
      const deps = appDeps()
      deps.dialog.replace = () => {
        soulOpened = true
      }
      const appLayer = keymap.registerLayer({ commands: buildAppCommands(deps) as any })
      const pluginApi = {
        keymap,
        ui: { dialog: { clear() {} } },
        route: {
          register() { return () => {} },
          navigate(name: string) {
            if (name === "diff") diffOpened = true
          },
          current: { name: "home" },
        },
      }
      void diffViewerPlugin.tui(pluginApi as any, undefined, { id: "diff-viewer" } as any)

      resolved = {
        soul: resolvePaletteSlashCommand(keymap, "/soul"),
        diff: resolvePaletteSlashCommand(keymap, "/diff"),
      }
      expect(keymap.dispatchCommand("instructions.edit")).toMatchObject({ ok: true })
      expect(keymap.dispatchCommand("diff.open")).toMatchObject({ ok: true })

      onCleanup(appLayer)
      return <box />
    }

    await testRender(() => <Harness />)

    expect(resolved).toEqual({ soul: "instructions.edit", diff: "diff.open" })
    expect(soulOpened).toBe(true)
    expect(diffOpened).toBe(true)
  })

  test("routes UI slashes before requiring an active agent", async () => {
    const source = await Bun.file(new URL("../src/component/prompt/index.tsx", import.meta.url)).text()
    const slashBlock = source.indexOf('if (trimmed.startsWith("/"))')
    const agentGuard = source.indexOf("const agent = local.agent.current()", slashBlock)

    expect(slashBlock).toBeGreaterThanOrEqual(0)
    expect(agentGuard).toBeGreaterThan(slashBlock)
  })
})

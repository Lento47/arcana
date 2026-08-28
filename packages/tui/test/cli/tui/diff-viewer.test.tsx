/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { DiffRenderable, type Renderable, ScrollBoxRenderable } from "@opentui/core"
import { testRender, useRenderer } from "@opentui/solid"
import { createSignal } from "solid-js"
import type { TuiPluginApi, TuiPluginMeta, TuiRouteCurrent, TuiRouteDefinition } from "@arcana/plugin/tui"
import type { Session } from "@arcana/sdk/v2"
import { KVProvider } from "../../../src/context/kv"
import { ThemeProvider } from "../../../src/context/theme"
import { ToastProvider } from "../../../src/ui/toast"
import { TuiConfigProvider } from "../../../src/config"
import { TuiKeybind } from "../../../src/config/keybind"
import { OpencodeKeymapProvider } from "../../../src/keymap"
import diffViewerPlugin, {
  DiffRequestTimeoutError,
  sameDiffRequest,
  withDiffRequestTimeout,
} from "../../../src/feature-plugins/system/diff-viewer"
import { createTuiPluginApi } from "../../fixture/tui-plugin"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TestTuiContexts } from "../../fixture/tui-environment"

test("closing the diff viewer returns to the route it opened from", async () => {
  const viewer = await renderDiffViewer([])
  try {
    expect(viewer.current()).toEqual({
      name: "diff",
      params: { mode: "git", sessionID: "session-1", returnRoute: startRoute },
    })
    expect(viewer.vcsDiffInput()).toEqual({ directory: "/repo/session", mode: "git", context: 12 })

    expect(viewer.commands.has("diff.close")).toBe(true)
    viewer.commands.get("diff.close")!.run?.({} as never)
    expect(viewer.current()).toEqual(startRoute)
  } finally {
    viewer.app.renderer.destroy()
  }
})

test("brackets navigate diff hunks", async () => {
  const viewer = await renderDiffViewer(
    [
      {
        file: "src/file.ts",
        additions: 3,
        deletions: 3,
        status: "modified",
        patch: `--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,3 @@
 const first = true
-const oldFirst = true
+const newFirst = true
 const afterFirst = true
@@ -20,3 +20,3 @@
 const second = true
-const oldSecond = true
+const newSecond = true
 const afterSecond = true
@@ -40,3 +40,3 @@
 const third = true
-const oldThird = true
+const newThird = true
 const afterThird = true`,
      },
    ],
    12,
  )
  try {
    await viewer.app.waitForFrame((frame) => frame.includes("const first"))
    await viewer.app.waitFor(() => Boolean(findScrollBox(viewer.app.renderer.root)))
    await viewer.app.flush()
    const scroll = findScrollBox(viewer.app.renderer.root)!
    const initial = scroll.scrollTop

    expect(TuiKeybind.defaultValue("diff_next_hunk")).toBe("]")
    expect(TuiKeybind.defaultValue("diff_previous_hunk")).toBe("[")

    viewer.commands.get("diff.next_hunk")!.run?.({} as never)
    await viewer.app.renderOnce()
    const first = scroll.scrollTop
    expect(first).toBeGreaterThan(initial)

    viewer.commands.get("diff.next_hunk")!.run?.({} as never)
    await viewer.app.renderOnce()
    const second = scroll.scrollTop
    expect(second).toBeGreaterThan(first)

    viewer.commands.get("diff.previous_hunk")!.run?.({} as never)
    await viewer.app.renderOnce()
    expect(scroll.scrollTop).toBe(first)

    viewer.commands.get("diff.next_hunk")!.run?.({} as never)
    await viewer.app.renderOnce()
    expect(scroll.scrollTop).toBe(second)

    scroll.scrollTo(initial)
    viewer.commands.get("diff.next_hunk")!.run?.({} as never)
    await viewer.app.renderOnce()
    expect(scroll.scrollTop).toBe(first)
  } finally {
    viewer.app.renderer.destroy()
  }
})

test("equivalent diff requests do not invalidate the resource", () => {
  expect(sameDiffRequest(
    { mode: "last-turn", sessionID: "session-1", messageID: "message-1", directory: "/repo" },
    { mode: "last-turn", sessionID: "session-1", messageID: "message-1", directory: "/repo" },
  )).toBe(true)
  expect(sameDiffRequest(
    { mode: "git", sessionID: "session-1", directory: "/repo" },
    { mode: "git", sessionID: "session-1", directory: "/other" },
  )).toBe(false)
})

test("diff requests abort and reject when the VCS read exceeds its bound", async () => {
  let signal: AbortSignal | undefined
  let error: unknown

  try {
    await withDiffRequestTimeout((requestSignal) => {
      signal = requestSignal
      return new Promise<never>(() => {})
    }, 10)
  } catch (cause) {
    error = cause
  }

  expect(error).toBeInstanceOf(DiffRequestTimeoutError)
  expect(signal?.aborted).toBe(true)
})

test("thinking-state invalidations keep one mounted diff and one request", async () => {
  const viewer = await renderDiffViewer([singleFileDiff("const stableReview = true")])
  try {
    await viewer.app.waitForFrame((frame) => frame.includes("const stableReview"))
    const mounted = findDiff(viewer.app.renderer.root)
    expect(mounted).toBeDefined()

    for (let frame = 1; frame <= 8; frame++) {
      viewer.bumpSessionRevision()
      await viewer.app.renderOnce()
      expect(viewer.app.captureCharFrame()).toContain("const stableReview")
      expect(findDiff(viewer.app.renderer.root)).toBe(mounted)
    }

    expect(viewer.vcsDiffCalls()).toBe(1)
  } finally {
    viewer.app.renderer.destroy()
  }
})

test("a real diff refresh keeps the previous patch mounted until replacement is ready", async () => {
  let resolveRefresh!: (value: unknown[]) => void
  const refresh = new Promise<unknown[]>((resolve) => { resolveRefresh = resolve })
  const viewer = await renderDiffViewer(
    [singleFileDiff("const oldSnapshot = true")],
    20,
    async (_input, call) => call === 1 ? [singleFileDiff("const oldSnapshot = true")] : refresh,
  )
  try {
    await viewer.app.waitForFrame((frame) => frame.includes("const oldSnapshot"))
    const mounted = findDiff(viewer.app.renderer.root)

    viewer.setDirectory("/repo/next")
    await viewer.app.waitFor(() => viewer.vcsDiffCalls() === 2)
    await viewer.app.renderOnce()
    const refreshingFrame = viewer.app.captureCharFrame()
    expect(refreshingFrame).toContain("const oldSnapshot")
    expect(refreshingFrame).not.toContain("Loading diff")
    expect(findDiff(viewer.app.renderer.root)).toBe(mounted)

    resolveRefresh([singleFileDiff("const newSnapshot = true")])
    await viewer.app.waitForFrame((frame) => frame.includes("const newSnapshot"))
    expect(viewer.app.captureCharFrame()).not.toContain("const oldSnapshot")
  } finally {
    resolveRefresh([])
    viewer.app.renderer.destroy()
  }
})

async function renderDiffViewer(
  vcsDiff: unknown[],
  height = 20,
  loadDiff?: (input: unknown, call: number) => unknown[] | Promise<unknown[]>,
) {
  const commands = new Map<
    string,
    NonNullable<Parameters<TuiPluginApi["keymap"]["registerLayer"]>[0]["commands"]>[number]
  >()
  let current = startRoute
  let renderDiff: TuiRouteDefinition["render"] | undefined
  let vcsDiffInput: unknown
  let vcsDiffCalls = 0
  let bumpSessionRevision = () => {}
  let setDirectory = (_directory: string) => {}
  const config = createTuiResolvedConfig()
  function Harness() {
    const [liveSession, setLiveSession] = createSignal<Session>(session)
    bumpSessionRevision = () => setLiveSession((current) => ({
      ...current,
      time: { ...current.time, updated: (current.time.updated ?? 0) + 1 },
    }))
    setDirectory = (directory) => setLiveSession((current) => ({ ...current, directory }))
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const registerLayer = keymap.registerLayer.bind(keymap)
    keymap.registerLayer = (layer) => {
      layer.commands?.forEach((command) => commands.set(command.name, command))
      return registerLayer(layer)
    }
    const base = createTuiPluginApi({
      keymap,
      client: {
        vcs: {
          diff: async (input: unknown) => {
            vcsDiffInput = input
            vcsDiffCalls++
            return { data: loadDiff ? await loadDiff(input, vcsDiffCalls) : vcsDiff }
          },
        },
        session: { diff: async () => ({ data: [] }) },
      } as unknown as TuiPluginApi["client"],
      state: {
        session: {
          get: () => liveSession(),
        },
      },
    })
    const api = {
      ...base,
      route: {
        register(routes) {
          renderDiff = routes.find((route) => route.name === "diff")?.render
          return () => {}
        },
        navigate(name, params) {
          current = params ? { name, params } : { name }
        },
        get current() {
          return current
        },
      },
    } satisfies TuiPluginApi

    void diffViewerPlugin.tui(api, undefined, pluginMeta)
    commands.get("diff.open")?.run?.({} as never)

    return (
      <TestTuiContexts>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ToastProvider>
                <ThemeProvider mode="dark">
                  {renderDiff?.({ params: "params" in current ? current.params : undefined })}
                </ThemeProvider>
              </ToastProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: 80, height })
  await waitForCommand(app, commands, "diff.close")
  return {
    app,
    commands,
    current: () => current,
    vcsDiffInput: () => vcsDiffInput,
    vcsDiffCalls: () => vcsDiffCalls,
    bumpSessionRevision,
    setDirectory,
  }
}

const startRoute: TuiRouteCurrent = { name: "session", params: { sessionID: "session-1" } }

function findScrollBox(root: Renderable): ScrollBoxRenderable | undefined {
  if (root instanceof ScrollBoxRenderable && containsDiff(root)) return root
  return root.getChildren().map(findScrollBox).find(Boolean)
}

function containsDiff(root: Renderable): boolean {
  if (root instanceof DiffRenderable) return true
  return root.getChildren().some(containsDiff)
}

function findDiff(root: Renderable): DiffRenderable | undefined {
  if (root instanceof DiffRenderable) return root
  return root.getChildren().map(findDiff).find(Boolean)
}

function singleFileDiff(line: string) {
  return {
    file: "src/review.ts",
    additions: 1,
    deletions: 1,
    status: "modified",
    patch: `--- a/src/review.ts\n+++ b/src/review.ts\n@@ -1 +1 @@\n-const previous = false\n+${line}`,
  }
}

const session = {
  id: "session-1",
  slug: "session-1",
  projectID: "project-1",
  directory: "/repo/session",
  title: "Session",
  version: "1",
  time: {
    created: 0,
    updated: 0,
  },
} satisfies Session

async function waitForCommand(
  app: Awaited<ReturnType<typeof testRender>>,
  commands: Map<string, unknown>,
  command: string,
) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await app.renderOnce()
    if (commands.has(command)) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

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

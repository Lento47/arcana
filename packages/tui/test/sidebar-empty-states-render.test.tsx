/** @jsxImportSource @opentui/solid */
/**
 * A sidebar section that is absent is not an empty state.
 *
 * Every panel wrapped its whole box — heading included — in
 * `Show when={list().length > 0}`, so a session with no artifacts, no diffs
 * or no MCP servers left a blank gap that read the same as a panel that had
 * not loaded. The MCP rows also printed the raw status token whenever the
 * engine reported a status this build does not enumerate. Each panel is
 * pinned here against the muted line it renders instead.
 */
import { testRender } from "@opentui/solid"
import { expect, mock, test } from "bun:test"
import type { TuiPluginApi, TuiPluginMeta } from "@arcana/plugin/tui"
import type { ArtifactSummary } from "../src/util/artifacts"
import type { BuiltinTuiPlugin } from "../src/feature-plugins/builtins"
import { createTuiPluginApi } from "./fixture/tui-plugin"
import { TestTuiProviders } from "./fixture/tui-providers"

// The artifacts panel reads ~/.arcana/artifacts directly, so the list has to
// be seeded through the module to keep the empty and filled cases apart.
let artifacts: ArtifactSummary[] = []

mock.module("../src/util/artifacts", () => ({
  listArtifacts: () => artifacts,
}))

const { default: artifactsPlugin } = await import("../src/feature-plugins/sidebar/artifacts")
const { default: filesPlugin } = await import("../src/feature-plugins/sidebar/files")
const { default: mcpPlugin } = await import("../src/feature-plugins/sidebar/mcp")
const { default: todoPlugin } = await import("../src/feature-plugins/sidebar/todo")

type SlotProps = { session_id: string }
type SlotView = (ctx: unknown, props: SlotProps) => unknown

/** Registers the plugin against a stub slots host and renders sidebar_content. */
async function mountSlot(plugin: BuiltinTuiPlugin, api: TuiPluginApi) {
  let view: SlotView | undefined
  const slots = {
    register(registration: { slots: { sidebar_content?: SlotView } }) {
      view = registration.slots.sidebar_content
      return () => {}
    },
  }
  await plugin.tui({ ...api, slots } as unknown as TuiPluginApi, undefined, pluginMeta)
  if (!view) throw new Error(`${plugin.id} registered no sidebar_content slot`)

  const app = await testRender(() => <TestTuiProviders>{view!(undefined, { session_id: "ses-1" }) as never}</TestTuiProviders>, {
    width: 100,
    height: 24,
  })
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

function sidebarApi(state: Record<string, unknown>) {
  const base = createTuiPluginApi()
  return {
    ...base,
    state: { ...(base.state as Record<string, unknown>), ...state },
  } as TuiPluginApi
}

test("Artifacts keeps its heading and says the list is empty", async () => {
  artifacts = []
  const app = await mountSlot(artifactsPlugin, createTuiPluginApi())
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("ARTIFACTS")
    expect(frame).toContain("No artifacts yet")
  } finally {
    app.renderer.destroy()
  }
})

test("Artifacts lists a stored artifact and drops the empty line", async () => {
  artifacts = [
    { id: "a1", title: "Run Report", type: "markdown", version: 2, versions: 2, tags: [], updated_at: 1 },
  ]
  const app = await mountSlot(artifactsPlugin, createTuiPluginApi())
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("Run Report")
    expect(frame).not.toContain("No artifacts yet")
  } finally {
    app.renderer.destroy()
    artifacts = []
  }
})

test("Modified Files keeps its heading and says nothing changed", async () => {
  const app = await mountSlot(
    filesPlugin,
    sidebarApi({ session: { get: () => undefined, diff: () => [] } }),
  )
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("MODIFIED FILES")
    expect(frame).toContain("No files changed yet")
  } finally {
    app.renderer.destroy()
  }
})

test("Modified Files lists a changed file and drops the empty line", async () => {
  const app = await mountSlot(
    filesPlugin,
    sidebarApi({
      session: { get: () => undefined, diff: () => [{ file: "src/app.ts", additions: 3, deletions: 1 }] },
    }),
  )
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("src/app.ts")
    expect(frame).not.toContain("No files changed yet")
  } finally {
    app.renderer.destroy()
  }
})

test("MCP keeps its heading and says no server is configured", async () => {
  const app = await mountSlot(mcpPlugin, sidebarApi({ mcp: () => [] }))
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("MCP")
    expect(frame).toContain("No MCP servers configured")
  } finally {
    app.renderer.destroy()
  }
})

test("MCP rows name an unrecognized engine status instead of echoing it", async () => {
  const app = await mountSlot(
    mcpPlugin,
    sidebarApi({ mcp: () => [{ name: "srv", status: "connecting", error: undefined }] }),
  )
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("srv")
    expect(frame).toContain("Unknown status")
    expect(frame).not.toContain("connecting")
  } finally {
    app.renderer.destroy()
  }
})

test("TODO stays visible with every task completed", async () => {
  const app = await mountSlot(
    todoPlugin,
    sidebarApi({ session: { get: () => undefined, todo: () => [{ content: "Ship the fix", status: "completed" }] } }),
  )
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("TODO")
    expect(frame).toContain("Ship the fix")
    expect(frame).not.toContain("No tasks yet")
  } finally {
    app.renderer.destroy()
  }
})

test("TODO keeps its heading and says no plan has been written", async () => {
  const app = await mountSlot(
    todoPlugin,
    sidebarApi({ session: { get: () => undefined, todo: () => [] } }),
  )
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("TODO")
    expect(frame).toContain("No tasks yet")
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

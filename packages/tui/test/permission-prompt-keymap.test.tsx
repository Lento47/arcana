/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, mock, test, describe } from "bun:test"
import { onCleanup } from "solid-js"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { ARCANA_BASE_MODE, OpencodeKeymapProvider, registerOpencodeKeymap } from "../src/keymap"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { TuiConfigProvider } from "../src/config"
import { TestTuiContexts } from "./fixture/tui-environment"
// Real modules spread into the mocks below so the partial overrides never
// shadow unrelated exports. A wholesale mock here previously erased
// `discoverThemes` from context/theme for every file running later in the
// same bun process — killing all 24 theme-readability tests as collateral.
import * as realSdk from "../src/context/sdk"
import * as realProject from "../src/context/project"
import * as realSync from "../src/context/sync"
import * as realPathFormat from "../src/context/path-format"
import * as realTheme from "../src/context/theme"

function installContextMocks(input: {
  replyCalls?: { requestID: string; reply: string; directory?: string; workspace?: string; message?: string }[]
  sessions?: { id: string; parentID?: string }[]
}) {
  mock.module("../src/context/sdk", () => ({
    ...realSdk,
    useSDK: () => ({
      client: {
        permission: {
          reply: (params: { requestID: string; reply: string; directory?: string; workspace?: string; message?: string }) => {
            input.replyCalls?.push(params)
          },
        },
      },
    }),
  }))

  mock.module("../src/context/project", () => ({
    ...realProject,
    useProject: () => ({
      workspace: {
        current: () => "ws-1",
      },
    }),
  }))

  mock.module("../src/context/sync", () => ({
    ...realSync,
    useSync: () => ({
      data: {
        session: input.sessions ?? [{ id: "sess-1" }],
        part: {},
      },
    }),
  }))

  mock.module("../src/context/path-format", () => ({
    ...realPathFormat,
    usePathFormatter: () => ({
      format: (p: string) => p,
    }),
  }))

  mock.module("../src/context/theme", () => ({
    ...realTheme,
    useTheme: () => ({
      theme: {
        background: "#000000",
        backgroundElement: "#111111",
        backgroundMenu: "#222222",
        borderActive: "#333333",
        diffAddedBg: "#004400",
        diffAddedLineNumberBg: "#005500",
        diffContextBg: "#000000",
        diffHighlightAdded: "#00ff00",
        diffHighlightRemoved: "#ff0000",
        diffLineNumber: "#888888",
        diffRemovedBg: "#440000",
        diffRemovedLineNumberBg: "#550000",
        error: "#ff0000",
        primary: "#aa00ff",
        spineContext: "#888888",
        spineFail: "#ff0000",
        spineFix: "#00ff00",
        spineRail: "#888888",
        text: "#ffffff",
        textMuted: "#888888",
        warning: "#ffaa00",
      } as never,
      syntax: () => "dark",
    }),
  }))
}

async function renderPrompt(request: PermissionRequest) {
  const mod: any = await import("../src/routes/session/permission")
  const PermissionPrompt = mod.PermissionPrompt
  const layers: any[] = []

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig({})
    const offKeymap = registerOpencodeKeymap(keymap, renderer, config)

    const registerLayer = keymap.registerLayer.bind(keymap)
    keymap.registerLayer = (layer) => {
      layers.push(layer)
      return registerLayer(layer)
    }

    onCleanup(() => {
      offKeymap()
    })

    return (
      <TestTuiContexts>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <PermissionPrompt request={request} directory="/tmp/opencode" />
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />)
  await app.renderOnce()
  return { app, layers, PermissionPrompt }
}

describe("PermissionPrompt keymap layer", () => {
  test("registers base-mode decision layer with priority 10 and Enter confirms once", async () => {
    const replyCalls: {
      requestID: string
      reply: string
      directory?: string
      workspace?: string
      message?: string
    }[] = []

    installContextMocks({ replyCalls })

    const request: PermissionRequest = {
      id: "perm-1",
      sessionID: "sess-1",
      permission: "edit",
      patterns: ["src/auth/*"],
      metadata: { filepath: "src/auth/login.ts" },
      always: [],
      tool: { messageID: "msg-1", callID: "call-1" },
    }

    const { app, layers } = await renderPrompt(request)
    try {
      const decisionLayer = layers.find(
        (layer: any) =>
          layer.mode === ARCANA_BASE_MODE &&
          layer.priority === 10 &&
          layer.bindings?.some((b: any) => b.key === "return"),
      ) as any

      expect(decisionLayer).toBeTruthy()
      expect(decisionLayer.mode).toBe(ARCANA_BASE_MODE)
      expect(decisionLayer.priority).toBe(10)

      const returnBinding = decisionLayer.bindings.find((b: any) => b.key === "return")
      expect(returnBinding).toBeTruthy()
      expect(returnBinding.preventDefault).toBe(true)
      returnBinding.cmd()

      expect(replyCalls).toEqual([
        { requestID: "perm-1", reply: "once", directory: "/tmp/opencode", workspace: "ws-1" },
      ])
    } finally {
      app.renderer.destroy()
      mock.restore()
    }
  })

  test("Enter also confirms the reject-confirmation textarea", async () => {
    const replyCalls: {
      requestID: string
      reply: string
      directory?: string
      workspace?: string
      message?: string
    }[] = []

    installContextMocks({
      replyCalls,
      sessions: [{ id: "sess-1", parentID: "parent-sess" }],
    })

    const request: PermissionRequest = {
      id: "perm-2",
      sessionID: "sess-1",
      permission: "edit",
      patterns: ["src/auth/*"],
      metadata: { filepath: "src/auth/login.ts" },
      always: [],
      tool: { messageID: "msg-2", callID: "call-2" },
    }

    const { app, layers } = await renderPrompt(request)
    try {
      const initialLayer = layers.find(
        (layer: any) =>
          layer.mode === ARCANA_BASE_MODE &&
          layer.priority === 10 &&
          layer.bindings?.some((b: any) => b.key === "return"),
      ) as any
      expect(initialLayer).toBeTruthy()

      // Move selection from "once" to "reject" (left/right cycle through once, always, reject).
      const rightBinding = initialLayer.bindings.find((b: any) => b.key === "right")
      expect(rightBinding).toBeTruthy()
      rightBinding.cmd()
      rightBinding.cmd()

      // Confirm "reject" on a subagent session to open the textarea rejection stage.
      const returnBinding = initialLayer.bindings.find((b: any) => b.key === "return")
      expect(returnBinding).toBeTruthy()
      returnBinding.cmd()

      await app.renderOnce()

      // A new priority-10 base-mode layer for the reject textarea should now be active.
      const rejectLayer = layers.find(
        (layer: any) =>
          layer.mode === ARCANA_BASE_MODE &&
          layer.priority === 10 &&
          layer.bindings?.some((b: any) => b.key === "return" && b.desc?.toLowerCase().includes("rejection")),
      ) as any
      expect(rejectLayer).toBeTruthy()

      const rejectReturn = rejectLayer.bindings.find((b: any) => b.key === "return")
      expect(rejectReturn).toBeTruthy()
      rejectReturn.cmd()

      expect(replyCalls).toEqual([
        {
          requestID: "perm-2",
          reply: "reject",
          directory: "/tmp/opencode",
          workspace: "ws-1",
          message: undefined,
        },
      ])
    } finally {
      app.renderer.destroy()
      mock.restore()
    }
  })
})

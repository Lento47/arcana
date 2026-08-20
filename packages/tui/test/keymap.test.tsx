/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { createBindingLookup } from "@opentui/keymap/extras"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test, describe } from "bun:test"
import { onCleanup } from "solid-js"
import { TuiKeybind } from "../src/config/keybind"
import { getOpencodeModeStack, ARCANA_BASE_MODE, OpencodeKeymapProvider, registerOpencodeKeymap, createEnterToReturnResolver } from "../src/keymap"

function createResolvedKeymapConfig(input: TuiKeybind.KeybindOverrides = {}) {
  const keybinds = TuiKeybind.parse(input)
  return {
    keybinds: createBindingLookup(TuiKeybind.toBindingConfig(keybinds), {
      commandMap: TuiKeybind.CommandMap,
      bindingDefaults: TuiKeybind.bindingDefaults(),
    }),
    leader_timeout: 2000,
  }
}

test("legacy page key aliases compile as page keys", async () => {
  const sequences: Record<string, string[][]> = {}

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createResolvedKeymapConfig({
      messages_page_up: "pgup",
      messages_page_down: "pgdown",
    })
    const offKeymap = registerOpencodeKeymap(keymap, renderer, config)
    const offLayer = keymap.registerLayer({
      bindings: config.keybinds.gather("session", ["session.page.up", "session.page.down"]),
    })
    const bindings = keymap.getCommandBindings({
      visibility: "registered",
      commands: ["session.page.up", "session.page.down"],
    })
    sequences.up =
      bindings.get("session.page.up")?.map((binding) => binding.sequence.map((part) => part.stroke.name)) ?? []
    sequences.down =
      bindings.get("session.page.down")?.map((binding) => binding.sequence.map((part) => part.stroke.name)) ?? []
    onCleanup(() => {
      offLayer()
      offKeymap()
    })

    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <box />
      </OpencodeKeymapProvider>
    )
  }

  const app = await testRender(() => <Harness />)
  try {
    expect(sequences).toEqual({
      up: [["pageup"]],
      down: [["pagedown"]],
    })
  } finally {
    app.renderer.destroy()
  }
})

test("mode-less bindings stay active when opencode mode changes", async () => {
  const counts: Record<string, Record<string, number>> = {}

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createResolvedKeymapConfig()
    const offKeymap = registerOpencodeKeymap(keymap, renderer, config)
    const offGlobal = keymap.registerLayer({
      commands: [
        { name: "session.list", run() {} },
        { name: "session.new", run() {} },
        { name: "session.page.up", run() {} },
        { name: "session.first", run() {} },
      ],
      bindings: config.keybinds.gather("test.global", [
        "session.list",
        "session.new",
        "session.page.up",
        "session.first",
      ]),
    })
    const offBase = keymap.registerLayer({
      mode: ARCANA_BASE_MODE,
      commands: [{ name: "model.list", run() {} }],
      bindings: config.keybinds.gather("test.base", ["model.list"]),
    })
    const activeCounts = () =>
      Object.fromEntries(
        Array.from(
          keymap.getCommandBindings({
            visibility: "active",
            commands: ["session.list", "session.new", "session.page.up", "session.first", "model.list"],
          }),
          ([command, bindings]) => [command, bindings.length],
        ),
      )

    counts.base = activeCounts()
    const popQuestion = getOpencodeModeStack(keymap).push("question")
    counts.question = activeCounts()
    popQuestion()
    const popAutocomplete = getOpencodeModeStack(keymap).push("autocomplete")
    counts.autocomplete = activeCounts()
    popAutocomplete()

    onCleanup(() => {
      offBase()
      offGlobal()
      offKeymap()
    })

    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <box />
      </OpencodeKeymapProvider>
    )
  }

  const app = await testRender(() => <Harness />)
  try {
    expect(counts).toEqual({
      base: { "session.list": 1, "session.new": 1, "session.page.up": 2, "session.first": 2, "model.list": 1 },
      question: { "session.list": 1, "session.new": 1, "session.page.up": 2, "session.first": 2, "model.list": 0 },
      autocomplete: {
        "session.list": 1,
        "session.new": 1,
        "session.page.up": 2,
        "session.first": 2,
        "model.list": 0,
      },
    })
  } finally {
    app.renderer.destroy()
  }
})

describe("enter-to-return key alias", () => {
  test("resolver maps enter events to return candidates", () => {
    const resolver = createEnterToReturnResolver()
    const ctx = {
      resolveKey: (key: { name: string; ctrl?: boolean; shift?: boolean; meta?: boolean; super?: boolean; hyper?: boolean | undefined }) =>
        `${key.ctrl ? "ctrl+" : ""}${key.shift ? "shift+" : ""}${key.meta ? "meta+" : ""}${key.name}`,
    }

    expect(resolver({ name: "enter" }, ctx)).toEqual(["return"])
    expect(resolver({ name: "enter", ctrl: true, shift: true }, ctx)).toEqual(["ctrl+shift+return"])
    expect(resolver({ name: "return" }, ctx)).toBeUndefined()
    expect(resolver({ name: "escape" }, ctx)).toBeUndefined()
  })

  test("registerOpencodeKeymap installs the alias resolver", async () => {
    let capturedKeymap: ReturnType<typeof createDefaultOpenTuiKeymap> | undefined
    function Harness() {
      const renderer = useRenderer()
      const keymap = createDefaultOpenTuiKeymap(renderer)
      capturedKeymap = keymap
      const config = createResolvedKeymapConfig()
      const offKeymap = registerOpencodeKeymap(keymap, renderer, config)
      const commands: string[] = []
      const offLayer = keymap.registerLayer({
        mode: ARCANA_BASE_MODE,
        priority: 10,
        commands: [{ name: "test.confirm", run() { commands.push("confirmed") } }],
        bindings: [{ key: "return", cmd: "test.confirm" }],
      })

      onCleanup(() => {
        offLayer()
        offKeymap()
      })

      return (
        <OpencodeKeymapProvider keymap={keymap}>
          <box />
        </OpencodeKeymapProvider>
      )
    }

    const app = await testRender(() => <Harness />)
    try {
      expect(capturedKeymap).toBeTruthy()
      const bindings = capturedKeymap!.getCommandBindings({ visibility: "registered", commands: ["test.confirm"] }).get("test.confirm")
      expect(bindings?.length).toBeGreaterThanOrEqual(1)
      expect(bindings?.[0]?.sequence?.map((part: any) => part.stroke.name)).toContain("return")
    } finally {
      app.renderer.destroy()
    }
  })
})

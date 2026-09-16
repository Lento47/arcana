/** @jsxImportSource @opentui/solid */
/**
 * The Acts card's footer hints must name keys the card actually answers to.
 *
 * It advertised `tab/↓↑` for navigation, but the only bindings it registers for
 * `dialog.select` are prev/next/submit, whose keys are `up`/`down`/`return`
 * (`config/keybind.ts`) — `tab` is the picker family's key for its *action* row,
 * which this card has none of. A hint naming a dead key is worse than no hint:
 * the operator keeps pressing it.
 *
 * The provider chain is hand-rolled (rather than `TestTuiProviders`) because the
 * card is pushed through `DialogProvider`, and the host renders it below that
 * provider — so every context it reads has to sit outside it.
 */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup, onMount } from "solid-js"
import { TuiConfigProvider } from "../src/config"
import { ClipboardProvider } from "../src/context/clipboard"
import { KVProvider } from "../src/context/kv"
import { RouteProvider } from "../src/context/route"
import { SDKProvider } from "../src/context/sdk"
import { SyncContext } from "../src/context/sync"
import { ThemeProvider } from "../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../src/keymap"
import { DialogMessage } from "../src/routes/session/dialog-message"
import { DialogProvider, useDialog } from "../src/ui/dialog"
import { ToastProvider } from "../src/ui/toast"
import { tmpdir } from "./fixture/fixture"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

const SESSION = "ses-1"
const MESSAGE = "msg-1"

const syncStub = {
  data: {
    message: { [SESSION]: [{ id: MESSAGE, role: "user" }] },
    part: { [MESSAGE]: [{ type: "text", text: "draw the sigil" }] },
  },
}

/**
 * Config key names for each hint an operator reads. Every advertised hint has to
 * resolve here, which is what gives the assertion teeth: `tab` has no entry
 * because nothing on this card listens for it.
 */
const HINT_KEYS: Record<string, readonly string[]> = {
  enter: ["return"],
  "↓↑": ["down", "up"],
  esc: ["escape"],
}

function boundKeys(commands: readonly string[]) {
  const config = createTuiResolvedConfig({})
  const keys = new Set<string>()
  for (const command of commands) {
    for (const binding of config.keybinds.get(command)) {
      if (typeof binding.key !== "string") continue
      for (const key of binding.key.split(",")) keys.add(key.trim())
    }
  }
  // Every dialog registers its own dismissal (`ui/dialog.tsx`), which is what
  // the shared close hint advertises.
  keys.add("escape")
  return keys
}

function Opener() {
  const dialog = useDialog()
  onMount(() => dialog.replace(() => <DialogMessage messageID={MESSAGE} sessionID={SESSION} />))
  return null
}

async function renderCard() {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig({})
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))

    return (
      <TestTuiContexts directory={tmp.path} paths={{ home: tmp.path, state, worktree: tmp.path }}>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ToastProvider>
                <ThemeProvider mode="dark">
                  <SDKProvider url="http://engine.local">
                    <SyncContext.Provider value={syncStub as never}>
                      <RouteProvider initialRoute={{ type: "session", sessionID: SESSION }}>
                        <ClipboardProvider value={{ write: async () => {} }}>
                          <DialogProvider>
                            <Opener />
                          </DialogProvider>
                        </ClipboardProvider>
                      </RouteProvider>
                    </SyncContext.Provider>
                  </SDKProvider>
                </ThemeProvider>
              </ToastProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: 120, height: 40, kittyKeyboard: true })
  // The card is pushed from `onMount`, so it lands a few frames in — `waitForFrame`
  // alone polls faster than the push settles.
  for (let attempt = 0; attempt < 40; attempt++) {
    await Bun.sleep(20)
    await app.renderOnce()
    if (app.captureCharFrame().includes("Acts")) break
  }
  return app
}

/**
 * Keys the footer row advertises. Selected by its `·` separators so the rail's
 * `[000]` step marker and the header's own `[esc]` are not mistaken for hints.
 */
function advertisedKeys(app: Awaited<ReturnType<typeof testRender>>) {
  return app
    .captureCharFrame()
    .split("\n")
    .filter((line) => line.includes("·"))
    .flatMap((line) => [...line.matchAll(/\[([^\]]+)\]/g)])
    .flatMap((match) => match[1]!.split("/"))
}

test("the acts footer advertises only keys the card binds", async () => {
  const app = await renderCard()
  try {
    const advertised = advertisedKeys(app)
    // Guards against a vacuous pass: the row is there and we read it.
    expect(advertised.length).toBeGreaterThan(0)
    expect(advertised).not.toContain("tab")

    const bound = boundKeys(["dialog.select.prev", "dialog.select.next", "dialog.select.submit"])
    for (const hint of advertised) {
      const keys = HINT_KEYS[hint]
      // An unrecognised hint means the row drifted from this table, not that
      // the key is fine.
      expect(keys).toBeDefined()
      for (const key of keys!) expect(bound.has(key)).toBe(true)
    }
  } finally {
    app.renderer.destroy()
  }
})

test("the dismissal is spelled once per card, by the shared hint", async () => {
  const app = await renderCard()
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("[esc] Close")
    // The footer used to spell that same action "vanish".
    expect(frame).not.toContain("vanish")
  } finally {
    app.renderer.destroy()
  }
})

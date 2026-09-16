/** @jsxImportSource @opentui/solid */
/**
 * The `/connect` row for the Arcana Plan tier is a brand surface, but the row's
 * title is served by the engine as the provider's own name — and the engine
 * calls that provider `opencode-go`. The picker therefore replaces it with the
 * tier name from `BRAND_TIERS`. A hardcoded literal in place of that lookup
 * passed every assertion while the two happened to agree, and then silently
 * kept the old name the moment the tier was renamed in branding.
 *
 * These pin the row to the brand source itself: the rendered frame is asserted
 * against `BRAND_TIERS.go.name`, and against a name the brand source was just
 * given, so a literal cannot satisfy them. The last case covers the other
 * freeze in this picker: the sign-in row's refetch is a round trip, and the row
 * has to say so while it is in flight.
 */
import { expect, test } from "bun:test"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { onCleanup, onMount, type ParentProps } from "solid-js"
import { BRAND_TIERS, COPY } from "../src/branding"
import {
  createDialogProviderOptions,
  DialogProvider as ProviderPicker,
  providerOptions,
} from "../src/component/dialog-provider"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { SDKProvider } from "../src/context/sdk"
import { SyncContext } from "../src/context/sync"
import { ThemeProvider } from "../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../src/keymap"
import { DialogProvider as DialogHost, useDialog } from "../src/ui/dialog"
import { ToastProvider } from "../src/ui/toast"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createFetch, json } from "./fixture/tui-sdk"

const PROXY_KEY_PATH = "/experimental/console/proxy-key-present"
/** The engine's name for the tier's provider — never what the operator should read. */
const SERVER_NAME = "Upstream Go"
const SIGN_IN_VALUE = "__ARCANA_oauth__"
const SIGN_IN_DESCRIPTION = "Free account · unlock more models"
const TITLE = "Connect a Provider"

function Opener() {
  const dialog = useDialog()
  onMount(() => dialog.replace(() => <ProviderPicker />))
  return null
}

/** The picker's whole provider chain, with the engine stubbed down to one provider. */
function Providers(props: ParentProps<{ fetch?: typeof fetch }>) {
  const renderer = useRenderer()
  const keymap = createDefaultOpenTuiKeymap(renderer)
  const config = createTuiResolvedConfig()
  onCleanup(registerOpencodeKeymap(keymap, renderer, config))

  const syncStub = {
    data: {
      provider: [],
      provider_next: { all: [{ id: "opencode-go", name: SERVER_NAME }], connected: [] },
      console_state: { consoleManagedProviders: [] },
      provider_auth: {},
    },
  }
  // A free-tier user: the proxy-key probe answers "absent", which is what keeps
  // the sign-in row on screen beside the tier row.
  const calls = createFetch((url) => (url.pathname === PROXY_KEY_PATH ? json({ present: false }) : undefined))

  return (
    <TestTuiContexts>
      <OpencodeKeymapProvider keymap={keymap}>
        <TuiConfigProvider config={config}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
                <SDKProvider
                  url="http://engine.local"
                  fetch={props.fetch ?? calls.fetch}
                  events={{ subscribe: async () => () => {} }}
                >
                  <SyncContext.Provider value={syncStub as never}>
                    <DialogHost>{props.children}</DialogHost>
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

/** Render the picker and return the settled frame. */
async function capture(): Promise<string> {
  const app = await testRender(
    () => (
      <Providers>
        <Opener />
      </Providers>
    ),
    { width: 96, height: 40 },
  )
  try {
    let frame = ""
    for (let i = 0; i < 100; i++) {
      await Bun.sleep(15)
      await app.renderOnce()
      await app.flush()
      await app.renderOnce()
      frame = app.captureCharFrame()
      if (frame.includes(TITLE)) break
    }
    return frame
  } finally {
    app.renderer.destroy()
  }
}

test("the tier row renders the brand tier name, never the engine's provider name", async () => {
  const frame = await capture()
  expect(frame).toContain(TITLE)
  expect(frame).toContain(BRAND_TIERS.go.name)
  expect(frame).not.toContain(SERVER_NAME)
})

test("the tier row reads BRAND_TIERS at render time, not a hardcoded name", async () => {
  const tier = BRAND_TIERS.go as { name: string }
  const branded = tier.name
  try {
    tier.name = "Arcana Conclave"
    const frame = await capture()
    expect(frame).toContain("Arcana Conclave")
    expect(frame).not.toContain(branded)
  } finally {
    tier.name = branded
  }
})

test("providerOptions takes the tier title from BRAND_TIERS", () => {
  const tier = BRAND_TIERS.go as { name: string }
  const branded = tier.name
  try {
    tier.name = "Arcana Conclave"
    const opts = providerOptions([{ id: "opencode-go", name: SERVER_NAME }])
    expect(opts.find((o) => o.type === "provider" && o.providerID === "opencode-go")?.title).toBe("Arcana Conclave")
  } finally {
    tier.name = branded
  }
})

function OptionsProbe(props: { expose: (options: ReturnType<typeof createDialogProviderOptions>) => void }) {
  const options = createDialogProviderOptions()
  onMount(() => props.expose(options))
  return null
}

test("selecting the sign-in row narrates its proxy-key round trip and ignores a second press", async () => {
  let probed = 0
  // The mount probe answers at once so the picker settles; the select's refetch
  // is slowed so the state it narrates is observable, and any other request is
  // answered blank rather than throwing out of the fetch stub.
  const calls = createFetch(async (url) => {
    if (url.pathname !== PROXY_KEY_PATH) return json({})
    probed++
    if (probed > 1) await Bun.sleep(150)
    return json({ present: false })
  })
  let options: ReturnType<typeof createDialogProviderOptions> | undefined
  const app = await testRender(
    () => (
      <Providers fetch={calls.fetch}>
        <OptionsProbe expose={(value) => (options = value)} />
      </Providers>
    ),
    { width: 96, height: 40 },
  )
  try {
    for (let i = 0; i < 100 && !options; i++) {
      await Bun.sleep(10)
      await app.renderOnce()
    }
    const signIn = () => options!().find((option) => option.value === SIGN_IN_VALUE)
    expect(signIn()?.description).toBe(SIGN_IN_DESCRIPTION)

    const pending = signIn()!.onSelect!()
    expect(signIn()?.description).toBe(COPY.dialog.signingIn)

    // Wait until the refetch has actually left, so the second press below lands
    // squarely inside the window the guard is for.
    for (let i = 0; i < 40 && probed < 2; i++) await Bun.sleep(5)
    expect(probed).toBe(2)

    await signIn()!.onSelect!()
    await Bun.sleep(30)
    expect(probed).toBe(2)
    await pending
  } finally {
    app.renderer.destroy()
  }
})

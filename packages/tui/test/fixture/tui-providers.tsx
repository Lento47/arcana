/** @jsxImportSource @opentui/solid */
/**
 * The provider chain every render test needs, in one place.
 *
 * `TestTuiContexts` covers the runtime paths, but each render test then
 * hand-wrote the same six providers on top of it — keymap, config, KV, toast,
 * theme, dialog — and every one of them had to remember the keymap
 * registration dance (`createDefaultOpenTuiKeymap` + `registerOpencodeKeymap`
 * + the cleanup) or fail with `Keymap not found`. Getting it wrong is a
 * per-file mistake with a confusing error, so it belongs in a fixture.
 *
 * Surface-specific providers (`RouteProvider`, `SDKProvider`, a stubbed
 * `SyncContext`) stay in the tests that need them — this composes with them.
 */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { useRenderer } from "@opentui/solid"
import { onCleanup, type ParentProps } from "solid-js"
import { ThemeProvider } from "../../src/context/theme"
import { KVProvider } from "../../src/context/kv"
import { TuiConfigProvider, type Resolved } from "../../src/config"
import { ToastProvider } from "../../src/ui/toast"
import { DialogProvider } from "../../src/ui/dialog"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../src/keymap"
import { TestTuiContexts } from "./tui-environment"
import { createTuiResolvedConfig } from "./tui-runtime"

export function TestTuiProviders(
  props: ParentProps<{
    /** Resolved config to hand `TuiConfigProvider`; default is the fixture's. */
    config?: Resolved
    mode?: "dark" | "light"
  }>,
) {
  const renderer = useRenderer()
  const keymap = createDefaultOpenTuiKeymap(renderer)
  const resolvedConfig = props.config ?? createTuiResolvedConfig()
  onCleanup(registerOpencodeKeymap(keymap, renderer, resolvedConfig))

  return (
    <TestTuiContexts>
      <OpencodeKeymapProvider keymap={keymap}>
        <TuiConfigProvider config={resolvedConfig}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode={props.mode ?? "dark"}>
                <DialogProvider>{props.children}</DialogProvider>
              </ThemeProvider>
            </ToastProvider>
          </KVProvider>
        </TuiConfigProvider>
      </OpencodeKeymapProvider>
    </TestTuiContexts>
  )
}

/**
 * ProviderTree — the 24-level deep provider nesting that wraps the App.
 *
 * Extracted from app.tsx to keep the orchestration layer readable.
 * Every provider here is a context boundary; the tree defines the
 * boot order and dependency graph for the entire TUI.
 *
 * Uses a `children` render prop to avoid circular dependency with app.tsx.
 */
import { ErrorBoundary, type JSX } from "solid-js"
import type { Global } from "@arcana/core/global"
import type { Renderable, KeyEvent } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"

import type { Args } from "./context/args"
import { ArgsProvider } from "./context/args"
import { ClipboardProvider } from "./context/clipboard"
import { EditorContextProvider } from "./context/editor"
import { ExitProvider } from "./context/exit"
import { EpilogueProvider } from "./context/epilogue"
import { GovernanceConfigProvider } from "./context/governance-config"
import { KVProvider } from "./context/kv"
import { LocalProvider } from "./context/local"
import { DataProvider } from "./context/data"
import { ProjectProvider } from "./context/project"
import { PromptQueueProvider } from "./context/prompt-queue"
import { PromptRefProvider } from "./context/prompt"
import { RouteProvider } from "./context/route"
import { TuiPathsProvider, TuiStartupProvider, TuiTerminalEnvironmentProvider } from "./context/runtime"
import { SDKProvider } from "./context/sdk"
import { SyncProvider } from "./context/sync"
import { VoiceProvider } from "./context/voice"
import { TuiConfigProvider, type TuiConfig } from "./config"
import { ErrorComponent } from "./component/error-component"
import { FrecencyProvider } from "./component/prompt/frecency"
import { PromptHistoryProvider } from "./component/prompt/history"
import { PromptStashProvider } from "./component/prompt/stash"
import { DialogProvider } from "./ui/dialog"
import { ToastProvider } from "./ui/toast"
import { ThemeProvider } from "./context/theme"
import { SessionPrewarmProvider } from "./routes/home/prewarm-session"
import { PluginRuntimeProvider, type PluginRuntime } from "./plugin/runtime"
import { OpencodeKeymapProvider } from "./keymap"
import type { EventSource } from "./context/sdk"

export type ProviderTreeProps = {
  children: JSX.Element
  mode: "dark" | "light"
  global: Global.Interface
  keymap: Keymap<Renderable, KeyEvent>
  pluginRuntime: PluginRuntime
  config: TuiConfig.Resolved
  args: Args
  url: string
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
  onExit: (reason: unknown) => void
  setEpilogue: (value?: string) => void
}

export function ProviderTree(props: ProviderTreeProps) {
  return (
    <ExitProvider
      exit={(reason) => {
        props.onExit(reason)
      }}
    >
      <EpilogueProvider set={(value) => props.setEpilogue(value)}>
        <ErrorBoundary fallback={(error, reset) => <ErrorComponent error={error} reset={reset} mode={props.mode} />}>
          <TuiPathsProvider
            value={{
              cwd: process.cwd(),
              home: props.global.home,
              state: props.global.state,
              worktree: props.global.data + "/worktree",
            }}
          >
            <TuiTerminalEnvironmentProvider
              value={{
                platform: process.platform,
                multiplexer: process.env.TMUX ? "tmux" : process.env.STY ? "screen" : undefined,
                displayServer: process.env.WAYLAND_DISPLAY
                  ? "wayland"
                  : process.env.DISPLAY
                    ? "x11"
                    : undefined,
              }}
            >                <TuiStartupProvider
                value={{
                  initialRoute: process.env.ARCANA_ROUTE ? (JSON.parse(process.env.ARCANA_ROUTE) as Args["continue"]) : undefined,
                  skipInitialLoading: Boolean(process.env.ARCANA_FAST_BOOT),
                }}
              >
                <ClipboardProvider>
                  <OpencodeKeymapProvider keymap={props.keymap}>
                    <ArgsProvider {...props.args}>
                      <KVProvider>
                        <ToastProvider>
                          <RouteProvider
                            initialRoute={
                              props.args.continue
                                ? {
                                    type: "session",
                                    sessionID: "dummy",
                                  }
                                : undefined
                            }
                          >
                            <TuiConfigProvider config={props.config}>
                              <PluginRuntimeProvider value={props.pluginRuntime}>
                                <SDKProvider
                                  url={props.url}
                                  directory={props.directory}
                                  fetch={props.fetch}
                                  headers={props.headers}
                                  events={props.events}
                                >
                                  <ProjectProvider>
                                    <GovernanceConfigProvider>
                                      <SyncProvider>
                                        <PromptQueueProvider>
                                          <DataProvider>
                                            <ThemeProvider mode={props.mode}>
                                              <LocalProvider>
                                                {/* Grok NewAuto-style: one spare session ready before first Home Enter. */}
                                                <SessionPrewarmProvider>
                                                  <PromptStashProvider>
                                                    <DialogProvider>
                                                      <FrecencyProvider>
                                                        <PromptHistoryProvider>
                                                          <PromptRefProvider>
                                                            <VoiceProvider>
                                                              <EditorContextProvider>
                                                                {props.children}
                                                              </EditorContextProvider>
                                                            </VoiceProvider>
                                                          </PromptRefProvider>
                                                        </PromptHistoryProvider>
                                                      </FrecencyProvider>
                                                    </DialogProvider>
                                                  </PromptStashProvider>
                                                </SessionPrewarmProvider>
                                              </LocalProvider>
                                            </ThemeProvider>
                                          </DataProvider>
                                        </PromptQueueProvider>
                                      </SyncProvider>
                                    </GovernanceConfigProvider>
                                  </ProjectProvider>
                                </SDKProvider>
                              </PluginRuntimeProvider>
                            </TuiConfigProvider>
                          </RouteProvider>
                        </ToastProvider>
                      </KVProvider>
                    </ArgsProvider>
                  </OpencodeKeymapProvider>
                </ClipboardProvider>
              </TuiStartupProvider>
            </TuiTerminalEnvironmentProvider>
          </TuiPathsProvider>
        </ErrorBoundary>
      </EpilogueProvider>
    </ExitProvider>
  )
}

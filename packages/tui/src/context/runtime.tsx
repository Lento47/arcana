import { createContext, type JSX, useContext, type ParentProps } from "solid-js"

export type TuiPaths = Readonly<{
  cwd: string
  home: string
  state: string
  worktree: string
}>

export type TuiTerminalEnvironment = Readonly<{
  platform: string
  multiplexer?: "tmux" | "screen"
  displayServer?: "wayland" | "x11"
}>

export type TuiStartup = Readonly<{
  initialRoute?: unknown
  skipInitialLoading: boolean
}>

const PathsContext = createContext<TuiPaths>()
const TerminalEnvironmentContext = createContext<TuiTerminalEnvironment>()
const StartupContext = createContext<TuiStartup>()

const DEFAULT_STARTUP: TuiStartup = Object.freeze({
  initialRoute: undefined,
  skipInitialLoading: false,
})

/** JSX Provider form — reliable with OpenTUI Solid transform (createComponent getters were not). */
export function TuiPathsProvider(props: ParentProps<{ value: TuiPaths }>) {
  return (
    <PathsContext.Provider value={Object.freeze({ ...props.value })}>{props.children}</PathsContext.Provider>
  )
}

export function TuiTerminalEnvironmentProvider(props: ParentProps<{ value: TuiTerminalEnvironment }>) {
  return (
    <TerminalEnvironmentContext.Provider value={Object.freeze({ ...props.value })}>
      {props.children}
    </TerminalEnvironmentContext.Provider>
  )
}

export function TuiStartupProvider(props: ParentProps<{ value: TuiStartup }>) {
  return (
    <StartupContext.Provider value={Object.freeze({ ...props.value })}>{props.children}</StartupContext.Provider>
  )
}

function required<T>(context: ReturnType<typeof createContext<T>>, name: string) {
  const value = useContext(context)
  if (!value) throw new Error(`${name} is missing`)
  return value
}

export function useTuiPaths() {
  return required(PathsContext, "TuiPathsProvider")
}

export function useTuiTerminalEnvironment() {
  return required(TerminalEnvironmentContext, "TuiTerminalEnvironmentProvider")
}

export function useTuiStartup() {
  // Prefer provider value; fall back so a missed transform/provider cannot hard-crash boot.
  return useContext(StartupContext) ?? DEFAULT_STARTUP
}

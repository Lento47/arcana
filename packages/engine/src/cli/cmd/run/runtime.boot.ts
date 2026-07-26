// Boot-time resolution for direct interactive mode.
//
// These functions run concurrently at startup to gather everything the runtime
// needs before the first frame: TUI keymap config, diff display style,
// model variant list with context limits, and session history for the prompt
// history ring. All are async because they read config or hit the SDK, but
// none block each other.
import { Context, Effect, Layer } from "effect"
import { resolve } from "@arcana/tui/config"
import { TuiConfig } from "@/config/tui"
import { makeRuntime } from "@/effect/run-service"
import { reusePendingTask } from "./runtime.shared"
import { resolveSession, sessionHistory } from "./session.shared"
import type { RunDiffStyle, RunInput, RunPrompt, RunProvider, RunTuiConfig } from "./types"
import { pickVariant } from "./variant.shared"

// Startup phase profiling — emits one JSON line per phase on stderr.
// Gated on ARCANA_PROFILE_STARTUP. Consumers: scripts/bench-startup.ts.
const BOOT_PROFILE = !!process.env["ARCANA_PROFILE_STARTUP"]
const BOOT_PROFILE_PID = process.pid
function bootEmit(phase: string, ts_ms: number) {
  if (!BOOT_PROFILE) return
  process.stderr.write(JSON.stringify({ phase, ts_ms, pid: BOOT_PROFILE_PID }) + "\n")
}

export type ModelInfo = {
  providers: RunProvider[]
  variants: string[]
  limits: Record<string, number>
}

export type SessionInfo = {
  first: boolean
  history: RunPrompt[]
  variant: string | undefined
}

type Config = Awaited<ReturnType<typeof TuiConfig.get>>
type BootService = {
  readonly resolveModelInfo: (
    sdk: RunInput["sdk"],
    directory: string,
    model: RunInput["model"],
  ) => Effect.Effect<ModelInfo>
  readonly resolveSessionInfo: (
    sdk: RunInput["sdk"],
    sessionID: string,
    model: RunInput["model"],
  ) => Effect.Effect<SessionInfo>
  readonly resolveRunTuiConfig: () => Effect.Effect<RunTuiConfig>
  readonly resolveDiffStyle: () => Effect.Effect<RunDiffStyle>
}

const configTask: { current?: Promise<Config> } = {}

class Service extends Context.Service<Service, BootService>()("@arcana/RunBoot") {}

function loadConfig() {
  return reusePendingTask(configTask, () => TuiConfig.get())
}

function emptyModelInfo(): ModelInfo {
  return {
    providers: [],
    variants: [],
    limits: {},
  }
}

function emptySessionInfo(): SessionInfo {
  return {
    first: true,
    history: [],
    variant: undefined,
  }
}

function defaultRunTuiConfig(): RunTuiConfig {
  return {
    ...resolve({}, { terminalSuspend: process.platform !== "win32" }),
    diff_style: "auto",
  }
}

function runTuiConfig(config: Config | undefined): RunTuiConfig {
  if (!config) {
    return defaultRunTuiConfig()
  }

  return {
    keybinds: config.keybinds,
    leader_timeout: config.leader_timeout,
    diff_style: config.diff_style ?? "auto",
  }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = Effect.fn("RunBoot.config")(() => Effect.promise(() => loadConfig().catch(() => undefined)))

    const resolveModelInfo = Effect.fn("RunBoot.resolveModelInfo")(function* (
      sdk: RunInput["sdk"],
      directory: string,
      model: RunInput["model"],
    ) {
      const connected = yield* Effect.promise(() =>
        sdk.config
          .providers({ directory })
          .then((item) => item.data?.providers)
          .catch(() => undefined),
      )
      async function loadProviders() {
        let list: any[]
        if (connected) {
          list = connected
        } else {
          try {
            const result = await sdk.provider.list()
            list = result.data?.all ?? []
          } catch {
            list = []
          }
        }
        // Always include Ollama as an available provider
        if (!list.some((p: any) => p.id === "ollama")) {
          list.push({ id: "ollama", name: "Ollama (local)", models: {} } as any)
        }
        return list
      }
      const providers = yield* Effect.promise(() => loadProviders())
      const limits = Object.fromEntries(
        providers.flatMap((provider) =>
          Object.entries(provider.models ?? {}).flatMap(([modelID, info]) => {
            const limit = (info as { limit?: { context?: number } } | undefined)?.limit?.context
            if (typeof limit !== "number" || limit <= 0) {
              return []
            }

            return [[`${provider.id}/${modelID}`, limit] as const]
          }),
        ),
      )

      if (!model) {
        return {
          providers,
          variants: [],
          limits,
        }
      }

      const info = providers.find((item) => item.id === model.providerID)?.models?.[model.modelID]
      return {
        providers,
        variants: Object.keys(info?.variants ?? {}),
        limits,
      }
    })

    const resolveSessionInfo = Effect.fn("RunBoot.resolveSessionInfo")(function* (
      sdk: RunInput["sdk"],
      sessionID: string,
      model: RunInput["model"],
    ) {
      const session = yield* Effect.promise(() => resolveSession(sdk, sessionID).catch(() => undefined))
      if (!session) {
        return emptySessionInfo()
      }

      return {
        first: session.first,
        history: sessionHistory(session),
        variant: pickVariant(model, session),
      }
    })

    const resolveRunTuiConfig = Effect.fn("RunBoot.resolveRunTuiConfig")(function* () {
      return runTuiConfig(yield* config())
    })

    const resolveDiffStyle = Effect.fn("RunBoot.resolveDiffStyle")(function* () {
      return (runTuiConfig(yield* config()).diff_style ?? "auto") as RunDiffStyle
    })

    return Service.of({
      resolveModelInfo,
      resolveSessionInfo,
      resolveRunTuiConfig,
      resolveDiffStyle,
    })
  }),
)

const runtime = makeRuntime(Service, layer)

// Fetches available variants and context limits for every provider/model pair.
export async function resolveModelInfo(
  sdk: RunInput["sdk"],
  directory: string,
  model: RunInput["model"],
): Promise<ModelInfo> {
  const t0 = performance.now()
  bootEmit("resolveModelInfo_start", t0)
  const out = await runtime.runPromise((svc) => svc.resolveModelInfo(sdk, directory, model)).catch(() => emptyModelInfo())
  bootEmit("resolveModelInfo_end", performance.now())
  bootEmit("resolveModelInfo_ms", Math.round(performance.now() - t0))
  return out
}

// Fetches session messages to determine if this is the first turn and build prompt history.
export async function resolveSessionInfo(
  sdk: RunInput["sdk"],
  sessionID: string,
  model: RunInput["model"],
): Promise<SessionInfo> {
  const t0 = performance.now()
  bootEmit("resolveSessionInfo_start", t0)
  const out = await runtime.runPromise((svc) => svc.resolveSessionInfo(sdk, sessionID, model)).catch(() => emptySessionInfo())
  bootEmit("resolveSessionInfo_end", performance.now())
  bootEmit("resolveSessionInfo_ms", Math.round(performance.now() - t0))
  return out
}

// Reads TUI config once for direct mode keymap setup and display preferences.
export async function resolveRunTuiConfig(): Promise<RunTuiConfig> {
  const t0 = performance.now()
  bootEmit("resolveRunTuiConfig_start", t0)
  const out = await runtime.runPromise((svc) => svc.resolveRunTuiConfig()).catch(() => defaultRunTuiConfig())
  bootEmit("resolveRunTuiConfig_end", performance.now())
  bootEmit("resolveRunTuiConfig_ms", Math.round(performance.now() - t0))
  return out
}

export async function resolveDiffStyle(): Promise<RunDiffStyle> {
  const t0 = performance.now()
  bootEmit("resolveDiffStyle_start", t0)
  const out = await runtime.runPromise((svc) => svc.resolveDiffStyle()).catch(() => "auto" as RunDiffStyle)
  bootEmit("resolveDiffStyle_end", performance.now())
  bootEmit("resolveDiffStyle_ms", Math.round(performance.now() - t0))
  return out
}

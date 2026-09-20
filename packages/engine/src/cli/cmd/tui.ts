import { cmd } from "@/cli/cmd/cmd"
import { Rpc } from "@/util/rpc"
import { type rpc } from "../tui/worker"
import path from "path"
import { fileURLToPath } from "url"
import { readFileSync } from "node:fs"
import { UI } from "@/cli/ui"
import { errorMessage } from "@arcana/tui/util/error"
import { Global } from "@arcana/core/global"
import { withTimeout } from "@/util/timeout"
import { withNetworkOptions, resolveNetworkOptionsNoConfig } from "@/cli/network"
import { Filesystem } from "@/util/filesystem"
import type { GlobalEvent } from "@arcana/sdk/v2"
import type { EventSource } from "@arcana/tui/context/sdk"
import { writeHeapSnapshot } from "node:v8"
import { win32EnableUtf8Console, win32InstallCtrlCGuard, win32RestoreTerminal } from "@arcana/tui/terminal-win32"
import { startStartupAnimation, type StartupAnimation } from "@arcana/tui/startup-animation"
import { mark, measure } from "../../cli/profile"
import { assertEngineHealthy, createDaemonTransport } from "../tui/daemon-transport"
import { DAEMON_LOG, daemonLog } from "../../daemon/log"

declare global {
  const ARCANA_WORKER_PATH: string
}

type RpcClient = ReturnType<typeof Rpc.client<typeof rpc>>

function reportStartupFailure(error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  daemonLog(`[tui] engine bootstrap failed pid=${process.pid} ${detail}`)
  UI.error(`Arcana engine failed to start. Diagnostic log: ${DAEMON_LOG}`)
  process.exitCode = 1
}

/**
 * Reconnect grace advertised by the daemon (/health). The daemon is detached,
 * so work started here survives the TUI; this tells the operator how long they
 * have to come back once the work settles. Best-effort: undefined on any error.
 */
async function daemonReconnectGraceMs(url: string): Promise<number | undefined> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1_500)
    try {
      const response = await fetch(`${url}/health`, { signal: controller.signal })
      if (!response.ok) return undefined
      const body = (await response.json()) as { daemon?: { reconnectGraceMs?: unknown } }
      const grace = body.daemon?.reconnectGraceMs
      return typeof grace === "number" && Number.isFinite(grace) && grace >= 0 ? grace : undefined
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return undefined
  }
}

function createWorkerFetch(client: RpcClient): typeof fetch {
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const body = request.body ? await request.text() : undefined
    try {
      const result = await client.call("fetch", {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body,
      })
      return new Response(result.body, {
        status: result.status,
        headers: result.headers,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: "Worker unavailable: " + msg }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })
    }
  }
  return fn as typeof fetch
}

function createEventSource(client: RpcClient): EventSource {
  return {
    subscribe: async (handler) => {
      return client.on<GlobalEvent>("global.event", (e) => {
        handler(e)
      })
    },
  }
}

async function target() {
  if (typeof ARCANA_WORKER_PATH !== "undefined") return ARCANA_WORKER_PATH
  const dist = new URL("./cli/tui/worker.js", import.meta.url)
  if (await Filesystem.exists(fileURLToPath(dist))) return dist
  return new URL("../tui/worker.ts", import.meta.url)
}

function isInteractiveTerminal() {
  // On some Windows hosts stdin.isTTY is false even for an interactive console
  // (see input() below), so win32 only requires stdout to be a TTY. Elsewhere
  // both must be TTYs (pipes/redirects/CI/background jobs hard-fail).
  if (process.platform === "win32") return !!process.stdout.isTTY
  return !!process.stdin.isTTY && !!process.stdout.isTTY
}

/**
 * The pre-render animation honors the same `animations_enabled` switch as the
 * rest of the TUI. The KV provider is not mounted this early, so read its
 * backing file directly (best effort — an unreadable store means "on").
 */
function startupAnimationsEnabled(): boolean {
  if (process.env.ARCANA_NO_STARTUP_ANIMATION === "1") return false
  try {
    const raw = readFileSync(path.join(Global.Path.state, "kv.json"), "utf8")
    return (JSON.parse(raw) as { animations_enabled?: unknown }).animations_enabled !== false
  } catch {
    return true
  }
}

async function input(value?: string) {
  // Only drain stdin when it is clearly non-interactive. On some Windows hosts
  // `stdin.isTTY` is false even for an interactive console; calling
  // `Bun.stdin.text()` there consumes the stream and OpenTUI sees EOF and exits
  // immediately. Prefer leaving stdin alone when stdout is still a TTY unless
  // the caller forces pipe reading via ARCANA_READ_STDIN=1.
  let piped: string | undefined
  if (!process.stdin.isTTY) {
    const forceRead = process.env.ARCANA_READ_STDIN === "1"
    const fullyNonInteractive = !process.stdout.isTTY
    if (forceRead || fullyNonInteractive) {
      piped = await Bun.stdin.text()
    }
  }
  if (!value) return piped
  if (!piped) return value
  return piped + "\n" + value
}

export function resolveThreadDirectory(project?: string, envPWD = process.env.PWD, cwd = process.cwd()) {
  const root = Filesystem.resolve(envPWD ?? cwd)
  if (project) return Filesystem.resolve(path.isAbsolute(project) ? project : path.join(root, project))
  // Honor the forwarded PWD (root = envPWD ?? cwd) for the bare/no-project case, so a
  // launcher that spawns this process from another dir (e.g. arcana delegates with
  // cwd=packages/opencode for the solid preload) still opens the TUI in the user's dir.
  // Consistent with run.ts, which already prefers process.env.PWD over process.cwd().
  return root
}

export const TuiThreadCommand = cmd({
  command: "$0 [project]",
  describe: "start arcana tui",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .positional("project", {
        type: "string",
        describe: "path to start arcana in",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("fork", {
        type: "boolean",
        describe: "fork the session when continuing (use with --continue or --session)",
      })
      .option("prompt", {
        type: "string",
        describe: "prompt to use",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      }),
  handler: async (args) => {
    mark("tui-handler-start")
    // Same guarantee as zero-arg index path: Solid transform must be registered
    // before dynamic imports of @arcana/tui / app.tsx.
    const { ensureSolidPreload } = await import("../tui/ensure-solid-preload")
    await ensureSolidPreload()
    const unguard = win32InstallCtrlCGuard()
    let startupAnimation: StartupAnimation | undefined
    try {
      // TUI requires a real interactive terminal. OpenTUI's CliRenderer calls
      // process.stdin.setRawMode() during construction, which throws on a
      // non-TTY stdin (piped output, redirected I/O, CI, backgrounded jobs).
      // Fail fast with a clear message instead of letting the bootstrap crash
      // dump the renderer stack trace. ARCANA_FORCE_TUI bypasses the check
      // for harnesses and deterministic tests that pre-create a renderer.
      if (!process.env["ARCANA_FORCE_TUI"] && !isInteractiveTerminal()) {
        UI.error("arcana tui requires an interactive terminal (TTY).")
        UI.error("Run from a real shell — not a pipe, redirect, or background job.")
        UI.error("If you are running under a debugger or test harness, set ARCANA_FORCE_TUI=1.")
        process.exitCode = 1
        return
      }
      // From here to the first TUI frame the terminal would otherwise be
      // silent: engine boot, the daemon wait, and renderer setup. The
      // animation covers that gap and is erased before OpenTUI takes over.
      win32EnableUtf8Console()
      startupAnimation = startStartupAnimation({ enabled: startupAnimationsEnabled() })
      const { TuiConfig } = await import("@/config/tui")
      if (args.fork && !args.continue && !args.session) {
        startupAnimation.stop()
        UI.error("--fork requires --continue or --session")
        process.exitCode = 1
        return
      }

      // Resolve relative --project paths from PWD, then use the real cwd after
      // chdir so the thread and worker share the same directory key.
      // Resolve the daemon script against the ORIGINAL cwd: after chdir below,
      // a relative process.argv[1] would resolve against the project dir.
      const daemonScript = process.argv[1] ? path.resolve(process.argv[1]) : ""
      const next = resolveThreadDirectory(args.project)
      const file = await target()
      try {
        process.chdir(next)
      } catch {
        startupAnimation.stop()
        UI.error("Failed to change directory to " + next)
        return
      }
      const cwd = Filesystem.resolve(process.cwd())

      // ── Daemon detection: try existing daemon, auto-spawn if missing ──
      const isCompiled = typeof Bun !== "undefined" && (Bun as any).isCompiled
      const daemonCmd = isCompiled
        ? [process.execPath, "--daemon"]
        : [process.execPath, "--conditions=browser", daemonScript, "--daemon"]
      // The engine host owns daemon lifecycle and injects the resulting
      // workspace-bound transport into the presentation package. The daemon
      // reads its lifecycle config (arcana.json daemon.*) itself at boot.
      const daemonAttempt = await createDaemonTransport({
        directory: cwd,
        command: daemonCmd,
      })
      const daemonTransport = daemonAttempt.status === "connected" ? daemonAttempt.transport : undefined
      if (daemonAttempt.status === "unavailable") {
        daemonLog(`[tui] daemon unavailable pid=${process.pid} reason=${daemonAttempt.reason}; trying worker fallback`)
        startupAnimation.setLabel("starting local engine")
      } else {
        startupAnimation.setLabel("opening interface")
      }

      let client: ReturnType<typeof Rpc.client<typeof rpc>> | undefined
      let worker: Worker | undefined
      let stop: () => Promise<void> = async () => {}

      if (!daemonTransport) {
        mark("worker-create")
        // bun Workers do NOT inherit process.env — forward it so the engine running
        // in the worker sees ARCANA_PROXY_KEY / OPENAI_API_KEY etc.
        try {
          worker = new Worker(file, {
            env: {
              ...(process.env as Record<string, string>),
              ...(process.env.ARCANA_PROXY_KEY ? { ARCANA_PROXY_KEY: process.env.ARCANA_PROXY_KEY } : {}),
            },
          })
        } catch (error) {
          startupAnimation.stop()
          reportStartupFailure(error)
          return
        }
        // A crashed worker otherwise leaves every RPC promise pending forever —
        // the TUI freezes with no recovery. Surface the death instead.
        worker.onerror = (error) => {
          const detail = error?.message ? String(error.message) : String(error)
          daemonLog(`[tui] worker crashed pid=${process.pid} ${detail}`)
          UI.error(`Arcana engine worker crashed: ${detail}`)
          process.exitCode = 1
        }
        client = Rpc.client<typeof rpc>(worker)
        const reload = () => {
          client!.call("reload", undefined).catch(() => {})
        }
        process.on("SIGUSR2", reload)

        let stopped = false
        stop = async () => {
          if (stopped) return
          stopped = true
          process.off("SIGUSR2", reload)
          await withTimeout(client!.call("shutdown", undefined), 5000).catch(() => {})
          worker!.terminate()
        }
      }

      const prompt = await input(args.prompt)
      const config = await TuiConfig.get()
      mark("tui-config-loaded")
      measure("tui-handler-start", "tui-config-loaded", "tui-init")

      const network = resolveNetworkOptionsNoConfig(args)
      const external =
        process.argv.includes("--port") ||
        process.argv.includes("--hostname") ||
        process.argv.includes("--mdns") ||
        network.mdns ||
        network.port !== 0 ||
        network.hostname !== "127.0.0.1"

      let transport: { url: string; fetch?: typeof fetch; events?: EventSource }
      try {
        transport = daemonTransport
          ? { ...daemonTransport, events: undefined }
          : external
          ? {
              url: (await client!.call("server", network)).url,
              fetch: undefined,
              events: undefined,
            }
          : {
              url: "http://arcana.internal",
              fetch: createWorkerFetch(client!),
              events: createEventSource(client!),
            }
        // Worker RPC does not consume Fetch's AbortSignal, so enforce the
        // bootstrap deadline at the host boundary as well.
        await withTimeout(assertEngineHealthy(transport), 10_000, "Arcana engine health check timed out")
      } catch (error) {
        startupAnimation.stop()
        await stop()
        reportStartupFailure(error)
        return
      }

      try {
        // Lazy on purpose: `validate-session` eagerly imports the generated SDK
        // and `@/session/schema` (which drags the whole `@arcana/core/session`
        // barrel — 19 modules, ~0.5s of boot). It only matters when the
        // operator asked for a specific session.
        if (args.session) {
          const { validateSession } = await import("../tui/validate-session")
          await validateSession({
            url: transport.url,
            sessionID: args.session,
            directory: cwd,
            fetch: transport.fetch,
          })
        }
      } catch (error) {
        startupAnimation.stop()
        await stop()
        UI.error(errorMessage(error))
        process.exitCode = 1
        return
      }

      if (client) {
        setTimeout(() => {
          client.call("checkUpgrade", { directory: cwd }).catch(() => {})
        }, 1000).unref?.()
      }

      setTimeout(async () => {
        try {
          const { existsSync, readFileSync: _readFileSync } = await import("node:fs")
          const { join } = await import("node:path")
          const { homedir } = await import("node:os")
          const dbPath = join(homedir(), ".arcana", "data", "arcana.db")
          if (existsSync(dbPath)) {
            fetch("https://api-arcana.otnelhq.com/api/health", { signal: AbortSignal.timeout(5000) }).catch(() => {})
          }
        } catch {}
      }, 2000).unref?.()

      try {
        const { Effect } = await import("effect")
        const { run } = await import("../tui/layer")
        const { createLegacyTuiPluginHost } = await import("@/plugin/tui/runtime")
        // The renderer is about to take the terminal: erase the startup line
        // first so OpenTUI starts from a clean screen.
        startupAnimation.stop()
        await Effect.runPromise(
          run({
            url: transport.url,
            async onSnapshot() {
              const tui = writeHeapSnapshot("tui.heapsnapshot")
              const server = client ? await client.call("snapshot", undefined) : ""
              return [tui, server]
            },
            config,
            pluginHost: createLegacyTuiPluginHost(),
            directory: cwd,
            fetch: transport.fetch,
            events: transport.events,
            args: {
              continue: args.continue,
              sessionID: args.session,
              agent: args.agent,
              model: args.model,
              prompt,
              fork: args.fork,
            },
          }),
        )
      } catch (error) {
        const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
        process.stderr.write(`[arcana] TUI runtime crashed:\n${detail}\n`)
        daemonLog(`[crash] tui runtime pid=${process.pid}\n${detail}`)
        UI.error(errorMessage(error))
        win32RestoreTerminal()
        process.exitCode = 1
      } finally {
        await stop()
      }

      // The daemon is detached: sessions started here keep running after the
      // TUI closes (Ctrl+C). Say so once, with the reconnect window.
      if (daemonTransport) {
        const grace = await daemonReconnectGraceMs(daemonTransport.url)
        if (grace !== undefined) {
          UI.println(
            grace > 0
              ? `Arcana keeps working in the background. Reopen the TUI here to reconnect — the daemon waits ~${Math.max(1, Math.round(grace / 60_000))}m after work settles.`
              : "Arcana keeps working in the background. Reopen the TUI here to reconnect — this daemon stays until stopped.",
          )
        }
      }
    } finally {
      startupAnimation?.stop()
      try {
        unguard?.()
      } catch {}
    }
  },
})
// scratch

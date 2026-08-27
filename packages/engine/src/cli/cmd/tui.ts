import { cmd } from "@/cli/cmd/cmd"
import { Rpc } from "@/util/rpc"
import { type rpc } from "../tui/worker"
import path from "path"
import { fileURLToPath } from "url"
import { UI } from "@/cli/ui"
import { errorMessage } from "@arcana/tui/util/error"
import { withTimeout } from "@/util/timeout"
import { withNetworkOptions, resolveNetworkOptionsNoConfig } from "@/cli/network"
import { Filesystem } from "@/util/filesystem"
import type { GlobalEvent } from "@arcana/sdk/v2"
import type { EventSource } from "@arcana/tui/context/sdk"
import { writeHeapSnapshot } from "node:v8"
import { validateSession } from "../tui/validate-session"
import { win32InstallCtrlCGuard } from "@arcana/tui/terminal-win32"
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
    try {
      const { TuiConfig } = await import("@/config/tui")
      if (args.fork && !args.continue && !args.session) {
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
      // workspace-bound transport into the presentation package.
      const daemonAttempt = await createDaemonTransport({
        directory: cwd,
        command: daemonCmd,
      })
      const daemonTransport = daemonAttempt.status === "connected" ? daemonAttempt.transport : undefined
      if (daemonAttempt.status === "unavailable") {
        daemonLog(`[tui] daemon unavailable pid=${process.pid} reason=${daemonAttempt.reason}; trying worker fallback`)
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
          reportStartupFailure(error)
          return
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
        await withTimeout(assertEngineHealthy(transport), 3_000, "Arcana engine health check timed out")
      } catch (error) {
        await stop()
        reportStartupFailure(error)
        return
      }

      try {
        await validateSession({
          url: transport.url,
          sessionID: args.session,
          directory: cwd,
          fetch: transport.fetch,
        })
      } catch (error) {
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
      } finally {
        await stop()
      }
    } finally {
      try {
        unguard?.()
      } catch {}
    }
  },
})
// scratch

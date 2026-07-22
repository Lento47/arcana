import { Server } from "@/server/server"
import { InstanceRuntime } from "@/project/instance-runtime"
import { Rpc } from "@/util/rpc"
import { upgrade } from "@/cli/upgrade"
import { Config } from "@/config/config"
import { GlobalBus } from "@/bus/global"
import { ServerAuth } from "@/server/auth"
import { writeHeapSnapshot } from "node:v8"
import { Heap } from "@/cli/heap"
import { AppRuntime } from "@/effect/app-runtime"
import { Effect } from "effect"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"

if (process.env["ARCANA_PROFILE_STARTUP"]) performance.mark("worker-init-start")

// bun Workers don't inherit process.env, and env-passing to a Worker can be unreliable
// in a `bun --compile` binary. Load the proxy key from disk directly (os.homedir() does
// NOT depend on inherited env) so the engine's arcana-proxy self-inject always sees
// ARCANA_PROXY_KEY — fixes /connect not showing Arcana Proxy in the packaged TUI.
if (!process.env["ARCANA_PROXY_KEY"]) {
  try {
    const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs")
    const { join } = require("node:path") as typeof import("node:path")
    const { homedir } = require("node:os") as typeof import("node:os")
    const home = process.env["ARCANA_HOME"] ?? join(homedir(), ".arcana")
    const keyFile = join(home, "proxy_key")
    if (existsSync(keyFile)) process.env["ARCANA_PROXY_KEY"] = readFileSync(keyFile, "utf8").trim()
  } catch {}
}

// Log unhandled rejections in the Worker so they are debuggable. Unlike the
// main process (index.ts), we do NOT call process.exit() here — the Effect
// runtime detects the failure and tears down cleanly. A silent Worker kill
// makes "TUI window just closes" bugs almost impossible to diagnose.
process.on("unhandledRejection", (reason) => {
  console.error("[arcana] Worker unhandled rejection:", reason)
})

Heap.start()

// Subscribe to global events and forward them via RPC
GlobalBus.on("event", (event) => {
  Rpc.emit("global.event", event)
})

let server: Awaited<ReturnType<typeof Server.listen>> | undefined

export const rpc = {
  async fetch(input: { url: string; method: string; headers: Record<string, string>; body?: string }) {
    const headers = { ...input.headers }
    const auth = ServerAuth.header()
    if (auth && !headers["authorization"] && !headers["Authorization"]) {
      headers["Authorization"] = auth
    }
    const request = new Request(input.url, {
      method: input.method,
      headers,
      body: input.body,
    })
    const response = await Server.Default().app.fetch(request)
    const body = await response.text()
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    }
  },
  snapshot() {
    const result = writeHeapSnapshot("server.heapsnapshot")
    return result
  },
  async server(input: { port: number; hostname: string; mdns?: boolean; cors?: string[] }) {
    if (server) await server.stop(true)
    server = await Server.listen(input)
    return { url: server.url.toString() }
  },
  async checkUpgrade(input: { directory: string }) {
    await InstanceRuntime.load({ directory: input.directory })
    await upgrade().catch(() => {})
  },
  async reload() {
    await AppRuntime.runPromise(
      Effect.gen(function* () {
        const cfg = yield* Config.Service
        yield* cfg.invalidate()
        yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
      }),
    )
  },
  async shutdown() {
    await InstanceRuntime.disposeAllInstances()
    if (server) await server.stop(true)
  },
}

Rpc.listen(rpc)

// Pre-warm the Effect service layer while the main process loads TUI modules.
// Server.Default() is lazy — first call builds 55+ services (3-8s on cold start).
// Triggering it here lets the build overlap with the main process's config loading,
// renderer init, and Solid tree mount instead of blocking the first API call.
Server.Default()

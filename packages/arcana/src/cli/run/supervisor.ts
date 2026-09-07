// packages/arcana/src/cli/run/supervisor.ts
//
// Authority Kernel S4 — supervised dual-process launch: kernel child first,
// agent second with ARCANA_KERNEL_PIPE + ARCANA_TRANSPORT=ipc so each gated
// process request uses IPC. This does not contain raw filesystem/network access.

import { spawn, type ChildProcess } from "node:child_process"
import { connect as netConnect } from "node:net"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { homedir } from "node:os"

export interface SupervisorKernelOptions {
  sessionId?: string
  /** Distinct endpoint for concurrent runner processes sharing a session. */
  endpointId?: string
  /** Listen target override. Default: OS-specific path keyed by session id. */
  listenPath?: string
  /** Authority DB owned by the kernel child. Default: ./.arcana/authority.db */
  dbPath?: string
}

export interface SupervisedRunResult {
  /** Path the kernel listened on. */
  listenPath: string
  /** Agent process exit code (null when killed by signal). */
  agentCode: number | null
  /** How the run ended. */
  outcome: "agent-exited" | "kernel-failed-to-start" | "spawn-error"
  stderr?: string
}

/** Resolve the kernel-entry module path relative to THIS file. */
function kernelEntryPath(): string {
  return join(import.meta.dir, "..", "..", "kernel-entry.ts")
}

/** OS-appropriate default listen target keyed by session id. */
export function defaultKernelListenPath(sessionId = "supervised"): string {
  const endpoint = createHash("sha256").update(sessionId).digest("hex").slice(0, 24)
  return process.platform === "win32"
    ? `\\\\.\\pipe\\arcana-kernel-${endpoint}`
    : join(homedir(), ".arcana", `kernel-${endpoint}.sock`)
}

/**
 * Poll-connect until the kernel accepts or the deadline passes. A raw
 * connect+destroy is harmless: frames are stateless.
 */
export function waitForKernelReady(listenPath: string, timeoutMs = 15_000, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let socket: ReturnType<typeof netConnect> | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      clearTimeout(retry)
      socket?.destroy()
      signal?.removeEventListener("abort", aborted)
      if (error) reject(error)
      else resolve()
    }
    const aborted = () => finish(new Error("kernel startup cancelled"))
    const deadline = setTimeout(() => finish(new Error(`kernel not ready within ${timeoutMs}ms at ${listenPath}`)), timeoutMs)
    const attempt = () => {
      if (settled) return
      socket = netConnect(listenPath)
      socket.once("connect", () => finish())
      socket.once("error", () => {
        socket?.destroy()
        if (!settled) retry = setTimeout(attempt, 100)
      })
    }
    signal?.addEventListener("abort", aborted, { once: true })
    if (signal?.aborted) aborted()
    else attempt()
  })
}

export interface SpawnedKernel {
  child: ChildProcess
  listenPath: string
}

/**
 * Spawn the kernel child and resolve once its pipe accepts connections.
 * Rejects (and kills the child) when readiness times out.
 */
export async function spawnKernelProcess(opts: SupervisorKernelOptions = {}): Promise<SpawnedKernel> {
  const sessionId = opts.sessionId ?? "supervised"
  const listenPath = opts.listenPath ?? defaultKernelListenPath(opts.endpointId ?? sessionId)
  if (process.platform !== "win32") {
    mkdirSync(join(homedir(), ".arcana"), { recursive: true })
  }
  const entry = process.env.ARCANA_KERNEL_ENTRY ?? kernelEntryPath()
  if (!existsSync(entry)) throw new Error(`kernel entry not found: ${entry}`)

  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ARCANA_KERNEL_PIPE: listenPath,
      ...(opts.dbPath ? { ARCANA_AUTHORITY_DB: opts.dbPath } : {}),
      ARCANA_SESSION_ID: sessionId,
    },
    stdio: ["ignore", "ignore", "inherit"],
  })
  const startup = new AbortController()
  let rejectLaunch: (error: Error) => void = () => {}
  const failed = new Promise<never>((_, reject) => { rejectLaunch = reject })
  const onError = (error: Error) => rejectLaunch(error)
  const onExit = (code: number | null) => rejectLaunch(new Error(`kernel exited before readiness (${code})`))
  child.once("error", onError)
  child.once("exit", onExit)
  try {
    await Promise.race([waitForKernelReady(listenPath, 15_000, startup.signal), failed])
  } catch (err) {
    child.kill()
    throw err
  } finally {
    startup.abort()
    child.off("error", onError)
    child.off("exit", onExit)
  }
  return { child, listenPath }
}

/**
 * Full supervised run: kernel first, agent second, clean teardown.
 * Resolves with the agent's exit code; SIGINT/SIGTERM are forwarded to the
 * agent, after which the kernel is shut down.
 */
export async function runSupervised(
  agentCommand: string[],
  opts: SupervisorKernelOptions = {},
): Promise<SupervisedRunResult> {
  if (!agentCommand.length) throw new Error("agentCommand must not be empty")
  let kernel: SpawnedKernel
  try {
    kernel = await spawnKernelProcess(opts)
  } catch (err) {
    return {
      listenPath: opts.listenPath ?? defaultKernelListenPath(opts.endpointId ?? opts.sessionId ?? "supervised"),
      agentCode: null,
      outcome: "kernel-failed-to-start",
      stderr: err instanceof Error ? err.message : String(err),
    }
  }

  return new Promise<SupervisedRunResult>((resolve) => {
    const agent = spawn(agentCommand[0]!, agentCommand.slice(1), {
      env: {
        ...process.env,
        ARCANA_KERNEL_PIPE: kernel.listenPath,
        ARCANA_TRANSPORT: "ipc",
        ARCANA_SESSION_ID: opts.sessionId ?? "supervised",
        ARCANA_AUTHORITY_DB: opts.dbPath ?? join(process.cwd(), ".arcana", "authority.db"),
      },
      stdio: "inherit",
    })

    const onInterrupt = () => agent.kill("SIGINT")
    const onTerminate = () => agent.kill("SIGTERM")
    let finished = false
    const finish = (agentCode: number | null, outcome: SupervisedRunResult["outcome"], stderr?: string) => {
      if (finished) return
      finished = true
      process.off("SIGINT", onInterrupt)
      process.off("SIGTERM", onTerminate)
      // Teardown order: agent first (already dead or dying), kernel last.
      try {
        kernel.child.kill()
      } catch { /* already gone */ }
      resolve({ listenPath: kernel.listenPath, agentCode, outcome, stderr })
    }

    agent.on("exit", (code) => finish(code, "agent-exited"))
    agent.on("error", (err) => finish(null, "spawn-error", err.message))

    process.once("SIGINT", onInterrupt)
    process.once("SIGTERM", onTerminate)

    // Kernel death mid-run fails closed: the agent discovers the dead pipe on
    // its next gated call.
    kernel.child.on("exit", (code, signal) => {
      if (agent.exitCode === null && !agent.signalCode) {
        console.error(`[supervisor] kernel exited prematurely (code=${code} signal=${signal})`)
      }
    })
  })
}

export * as RunSupervisor from "./supervisor"

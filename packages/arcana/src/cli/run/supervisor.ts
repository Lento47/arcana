// packages/arcana/src/cli/run/supervisor.ts
//
// Authority Kernel S4 — supervised dual-process launch: kernel child first,
// agent second with ARCANA_KERNEL_PIPE + ARCANA_TRANSPORT=ipc so every gated
// effect is mediated over IPC. Kernel death while the agent runs fails closed
// by construction (stateless frames, no ambient authority).

import { spawn, type ChildProcess } from "node:child_process"
import { connect as netConnect } from "node:net"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

export interface SupervisorKernelOptions {
  sessionId?: string
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
  return process.platform === "win32"
    ? `\\\\.\\pipe\\arcana-kernel-${sessionId}`
    : join(homedir(), ".arcana", `kernel-${sessionId}.sock`)
}

/**
 * Poll-connect until the kernel accepts or the deadline passes. A raw
 * connect+destroy is harmless: frames are stateless.
 */
export function waitForKernelReady(listenPath: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = netConnect(listenPath)
      const giveUp = setTimeout(() => {
        socket.destroy()
        reject(new Error(`kernel not ready within ${timeoutMs}ms at ${listenPath}`))
      }, deadline - Date.now())
      socket.once("connect", () => {
        clearTimeout(giveUp)
        socket.destroy()
        resolve()
      })
      socket.once("error", () => {
        clearTimeout(giveUp)
        socket.destroy()
        if (Date.now() >= deadline) reject(new Error(`kernel not ready within ${timeoutMs}ms at ${listenPath}`))
        else setTimeout(attempt, 100)
      })
    }
    attempt()
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
  const listenPath = opts.listenPath ?? defaultKernelListenPath(sessionId)
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
    stdio: ["ignore", "inherit", "inherit"],
  })
  try {
    await waitForKernelReady(listenPath)
  } catch (err) {
    child.kill()
    throw err
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
      listenPath: opts.listenPath ?? defaultKernelListenPath(opts.sessionId ?? "supervised"),
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
        ARCANA_AUTHORITY_DB: opts.dbPath ?? join(process.cwd(), ".arcana", "authority.db"),
      },
      stdio: "inherit",
    })

    const finish = (agentCode: number | null, outcome: SupervisedRunResult["outcome"], stderr?: string) => {
      // Teardown order: agent first (already dead or dying), kernel last.
      try {
        kernel.child.kill()
      } catch { /* already gone */ }
      resolve({ listenPath: kernel.listenPath, agentCode, outcome, stderr })
    }

    agent.on("exit", (code) => finish(code, "agent-exited"))
    agent.on("error", (err) => finish(null, "spawn-error", err.message))

    process.once("SIGINT", () => agent.kill())
    process.once("SIGTERM", () => agent.kill())

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

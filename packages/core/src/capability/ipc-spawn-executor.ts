// packages/core/src/capability/ipc-spawn-executor.ts
//
// Authority Kernel S4 M-d — IpcSpawnExecutor.
//
// Implements SpawnExecutor over a local socket/pipe to the privileged
// kernel process. The agent process sends a framed request; the kernel
// mediates (PDP → PEP) and executes; the result comes back as a framed
// response.
//
// This is the S4 wire client that replaces Bun.spawnSync when
// ARCANA_TRANSPORT=ipc is set.

import net from "node:net"
import type { SpawnExecutor, SpawnResult } from "./spawn-executor"
import { encodeFrame, decodeFrame } from "./ipc-frame"

export interface IpcSpawnExecutorOptions {
  /** Kernel listen path (Unix socket or named pipe). */
  pipePath: string
  /** Instance id sent for attribution. */
  instanceId?: string
  /** Per-call timeout in ms. Defaults to 30s. */
  timeoutMs?: number
}

/**
 * Create an async SpawnExecutor that routes spawns through the kernel IPC.
 * Satisfies the same interface as bunSpawnExecutor — drop-in replacement
 * when ARCANA_TRANSPORT=ipc is set.
 */
export function createIpcSpawnExecutor(opts: IpcSpawnExecutorOptions): SpawnExecutor {
  const timeoutMs = opts.timeoutMs ?? 30_000
  return (argv, spawnOpts) => {
    const req = {
      v: 1,
      id: `ipc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      seq: 1,
      kind: "process",
      payload: {
        toolName: "shell",
        argv,
        cwd: spawnOpts?.cwd ?? null,
        env: spawnOpts?.env ?? undefined,
      },
      auth: { instanceId: opts.instanceId ?? "ipc" },
    }
    const framed = encodeFrame(req)

    return new Promise<SpawnResult>((resolve, reject) => {
      const socket = net.connect(opts.pipePath)
      let acc = Buffer.alloc(0)
      let settled = false

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          socket.destroy()
          reject(new Error(`kernel IPC timeout after ${timeoutMs}ms`))
        }
      }, timeoutMs)
      const finish = (fn: (v: never) => void, v: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        socket.destroy()
        fn(v as never)
      }

      socket.on("connect", () => {
        socket.write(framed)
      })

      socket.on("data", (chunk: Buffer) => {
        acc = Buffer.concat([acc, chunk])
        if (acc.length < 4) return
        const len = acc.readUInt32BE(0)
        if (acc.length < 4 + len) return
        try {
          const resp = decodeFrame<{ ok: boolean; result?: Record<string, unknown>; error?: { code: string; message: string } }>(
            acc.subarray(0, 4 + len),
          )
          const r = resp.result as { stdout?: string; stderr?: string; exitCode?: number | null } | undefined
          finish(resolve, {
            status: "EXECUTED",
            stdout: r?.stdout ?? "",
            stderr: r?.stderr ?? "",
            exitCode: r?.exitCode ?? null,
          })
        } catch (e) {
          finish(reject, e)
        }
      })

      socket.on("error", (e) => finish(reject, e))
      socket.on("close", () => {
        if (!settled) finish(reject, new Error("kernel closed before response"))
      })
    })
  }
}

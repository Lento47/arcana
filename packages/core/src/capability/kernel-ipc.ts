// packages/core/src/capability/kernel-ipc.ts
//
// Authority Kernel S4 M-c — the privileged KERNEL half of the IPC surface.
//
// Listens on a local socket/pipe, accepts framed KernelRequests, and runs
// authorizeProcess per effect — the FULL mediation pipeline inside THIS
// privileged process, against THIS process's authority database. The agent
// process never touches the store.
//
// Output-Gate note: CLAIMED/DISPATCHED durability is structural here — the
// kernel commits claim state before invoking any external send, because the
// commit happens in this process and dispatch in the child.

import net from "node:net"
import { encodeFrame, decodeFrame, FrameError, frameRequestId, IPC_PROTOCOL_VERSION } from "./ipc-frame"
import { authorizeProcess } from "./process-gate"

export interface KernelServerOptions {
  /** Listen target: Unix socket path or Windows named pipe (\\.\pipe\name). */
  listenPath: string
  /** Authority database owned by THIS process. */
  dbPath: string
  principalId?: string
  sessionId: string
  skipBootstrap?: boolean
  /** Test hook: inject a spawn executor (counting/failing) server-side. */
  spawnExecutor?: Parameters<typeof authorizeProcess>[0]["spawnExecutor"]
}

interface IncomingRequest {
  v: number
  id: string
  seq: number
  kind: "process" | "fs" | "network" | "secret"
  payload: Record<string, unknown>
  auth: { instanceId: string }
}

/**
 * Start the privileged kernel server. Resolves when the listener is bound;
 * call `.close()` to shut down. Connections are stateless — every frame is
 * mediated independently (fail-closed on kernel death by construction).
 */
export async function startKernelServer(
  options: KernelServerOptions,
): Promise<{ path: string; close(): Promise<void> }> {
  const principalId = options.principalId ?? "arcana-cli"

  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0)
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      // Drain all complete frames accumulated so far.
      while (buffer.length >= 4) {
        const len = buffer.readUInt32BE(0)
        if (len > 64 * 1024 * 1024 || buffer.length < 4 + len) break
        const framed = buffer.subarray(4, 4 + len)
        buffer = buffer.subarray(4 + len)
        void handleFrame(socket, framed).catch((error) => {
          const resp = {
            v: 1,
            id: "unknown",
            ok: false,
            error: { code: "KERNEL_ERROR", message: String(error).slice(0, 300) },
          }
          socket.write(encodeFrame(resp))
        })
      }
    })
    socket.on("error", () => {})
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(options.listenPath, () => resolve())
  })

  return {
    path: options.listenPath,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }

  async function handleFrame(socket: net.Socket, framed: Buffer): Promise<void> {
    let req: IncomingRequest
    try {
      req = decodeFrame<IncomingRequest>(framed)
    } catch (e) {
      const fe = e as FrameError
      socket.write(
        encodeFrame({ v: 1, id: "?", ok: false, error: { code: fe.code, message: fe.message } }),
      )
      return
    }

    try {
      if (req.kind !== "process") {
        throw new Error(`kind ${req.kind} is not routed over IPC yet`)
      }
      const payload = req.payload as {
        toolName?: string
        argv?: string[]
        cwd?: string
        env?: Record<string, string>
      }

      const result = await authorizeProcess(
        {
          dbPath: options.dbPath,
          sessionId: options.sessionId,
          principalId,
          skipBootstrap: options.skipBootstrap,
        },
        {
          toolName: payload.toolName ?? "shell",
          argv: payload.argv ?? [],
          cwd: payload.cwd,
          env: payload.env,
          requestId: req.id,
        },
      )

      socket.write(encodeFrame({ v: 1, id: req.id, ok: true, result }))
    } catch (error) {
      socket.write(
        encodeFrame({
          v: 1,
          id: req.id,
          ok: false,
          error: { code: "KERNEL_ERROR", message: String(error).slice(0, 300) },
        }),
      )
    }
  }
}

// ─── Client side ────────────────────────────────────────────────────────

export interface IpcSpawnRequest {
  argv: string[]
  cwd?: string
  nonce?: string
  requestedAt?: string
  requestId?: string
}

/**
 * One-shot framed request/response over the kernel listen path.
 * Opens a fresh connection per call (v1 simplicity); pooling is a later
 * optimization. Resolves the kernel's mediation result for the spawn.
 */
export function ipcSpawnViaKernel(
  listenPath: string,
  input: IpcSpawnRequest & { sessionId: string },
): Promise<{ status: string; stdout?: string; stderr?: string; exitCode?: number | null; reasons?: unknown; message?: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(listenPath)
    let acc = Buffer.alloc(0)
    let settled = false

    const finish = (fn: (v: never) => void, v: unknown) => {
      if (settled) return
      settled = true
      socket.destroy()
      fn(v as never)
    }

    socket.on("connect", () => {
      const req = {
        v: IPC_PROTOCOL_VERSION,
        id: input.requestId ?? frameRequestId(input.argv.join(" ")),
        seq: 1,
        kind: "process",
        payload: {
          toolName: "shell",
          argv: input.argv,
          cwd: input.cwd ?? null,
        },
        auth: { instanceId: "ipc-client" },
      }
      socket.write(encodeFrame(req))
    })

    socket.on("data", (chunk: Buffer) => {
      acc = Buffer.concat([acc, chunk])
      if (acc.length < 4) return
      const len = acc.readUInt32BE(0)
      if (acc.length < 4 + len) return
      try {
        const resp = decodeFrame<{ id: string; ok: boolean; result?: { status: string; stdout?: string; stderr?: string; exitCode?: number | null; message?: string }; error?: { code: string; message: string } }>(
          acc.subarray(4, 4 + len),
        )
        finish(resolve, resp.result ?? resp)
      } catch (e) {
        finish(reject, e)
      }
    })

    socket.on("error", (e) => finish(reject, e))
    socket.on("close", () => finish(reject, new Error("kernel closed before response")))
    socket.setTimeout(30_000, () => finish(reject, new Error("kernel IPC timeout")))
  })
}

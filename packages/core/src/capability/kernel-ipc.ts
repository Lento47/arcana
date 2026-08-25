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
import {
  assertResponseId,
  decodeFrame,
  encodeFrame,
  FrameError,
  FrameSequencer,
  frameRequestId,
  IPC_PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
} from "./ipc-frame"
import { authorizeProcess } from "./process-gate"
import type { ProcessGateResult } from "./process-gate"

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
    const incomingSequence = new FrameSequencer()
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      // Drain all complete frames accumulated so far.
      while (buffer.length >= 4) {
        const len = buffer.readUInt32BE(0)
        if (len > MAX_FRAME_BYTES) {
          socket.end(
            encodeFrame({
              v: IPC_PROTOCOL_VERSION,
              id: "?",
              ok: false,
              error: {
                code: "OVERSIZE",
                message: `frame exceeds ${MAX_FRAME_BYTES} bytes`,
              },
            }),
          )
          buffer = Buffer.alloc(0)
          return
        }
        if (buffer.length < 4 + len) break
        const framed = buffer.subarray(4, 4 + len)
        buffer = buffer.subarray(4 + len)
        void handleFrame(socket, framed, incomingSequence).catch((error) => {
          const resp = {
            v: IPC_PROTOCOL_VERSION,
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

  async function handleFrame(socket: net.Socket, framed: Buffer, incomingSequence: FrameSequencer): Promise<void> {
    let req: IncomingRequest
    try {
      req = decodeFrame<IncomingRequest>(framed)
    } catch (e) {
      const fe = e as FrameError
      socket.write(
        encodeFrame({
          v: IPC_PROTOCOL_VERSION,
          id: "?",
          ok: false,
          error: { code: fe.code, message: fe.message },
        }),
      )
      return
    }

    try {
      if (typeof req.id !== "string" || req.id.length === 0) {
        throw new Error("request id is required")
      }
      if (!incomingSequence.accept(req.seq)) {
        socket.write(
          encodeFrame({
            v: IPC_PROTOCOL_VERSION,
            id: req.id,
            ok: false,
            error: {
              code: "SEQ_REGRESSION",
              message: `sequence ${String(req.seq)} does not advance the connection sequence`,
            },
          }),
        )
        return
      }
      if (!req.auth || typeof req.auth.instanceId !== "string" || req.auth.instanceId.length === 0) {
        throw new Error("auth.instanceId is required")
      }
      if (req.kind !== "process") {
        throw new Error(`kind ${req.kind} is not routed over IPC yet`)
      }
      if (!req.payload || typeof req.payload !== "object" || Array.isArray(req.payload)) {
        throw new Error("process payload must be an object")
      }
      const payload = req.payload as {
        toolName?: string
        argv?: string[]
        cwd?: string
        env?: Record<string, string>
        nonce?: string
        requestedAt?: string
      }
      if (
        !Array.isArray(payload.argv) ||
        payload.argv.length === 0 ||
        payload.argv.some((arg) => typeof arg !== "string")
      ) {
        throw new Error("process payload argv must be a non-empty string array")
      }
      if (payload.toolName !== undefined && typeof payload.toolName !== "string") {
        throw new Error("process payload toolName must be a string")
      }
      if (payload.cwd !== undefined && typeof payload.cwd !== "string") {
        throw new Error("process payload cwd must be a string")
      }
      if (
        payload.env !== undefined &&
        (typeof payload.env !== "object" ||
          payload.env === null ||
          Array.isArray(payload.env) ||
          Object.values(payload.env).some((value) => typeof value !== "string"))
      ) {
        throw new Error("process payload env must contain only string values")
      }

      const result = await authorizeProcess(
        {
          dbPath: options.dbPath,
          sessionId: options.sessionId,
          principalId,
          skipBootstrap: options.skipBootstrap,
          spawnExecutor: options.spawnExecutor,
        },
        {
          toolName: payload.toolName ?? "shell",
          argv: payload.argv ?? [],
          cwd: payload.cwd,
          env: payload.env,
          nonce: payload.nonce,
          requestedAt: payload.requestedAt,
          requestId: req.id,
          instanceId: req.auth.instanceId,
        },
      )

      socket.write(encodeFrame({ v: IPC_PROTOCOL_VERSION, id: req.id, ok: true, result }))
    } catch (error) {
      socket.write(
        encodeFrame({
          v: IPC_PROTOCOL_VERSION,
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
  toolName?: string
  argv: string[]
  cwd?: string
  env?: Record<string, string>
  instanceId?: string
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
): Promise<ProcessGateResult> {
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
      const requestId = input.requestId ?? frameRequestId(input.argv.join(" "))
      const req = {
        v: IPC_PROTOCOL_VERSION,
        id: requestId,
        seq: 1,
        kind: "process",
        payload: {
          toolName: input.toolName ?? "shell",
          argv: input.argv,
          cwd: input.cwd,
          env: input.env,
          nonce: input.nonce,
          requestedAt: input.requestedAt,
        },
        auth: { instanceId: input.instanceId ?? "ipc-client" },
      }
      socket.write(encodeFrame(req))
    })

    socket.on("data", (chunk: Buffer) => {
      acc = Buffer.concat([acc, chunk])
      if (acc.length < 4) return
      const len = acc.readUInt32BE(0)
      if (len > MAX_FRAME_BYTES) {
        finish(reject, new FrameError("OVERSIZE", `response exceeds ${MAX_FRAME_BYTES} bytes`))
        return
      }
      if (acc.length < 4 + len) return
      try {
        const resp = decodeFrame<{
          id: string
          ok: boolean
          result?: ProcessGateResult
          error?: { code: string; message: string }
        }>(acc.subarray(4, 4 + len))
        const expectedId = input.requestId ?? frameRequestId(input.argv.join(" "))
        assertResponseId(expectedId, resp.id)
        if (!resp.ok || !resp.result) {
          const code = resp.error?.code ?? "KERNEL_ERROR"
          const message = resp.error?.message ?? "kernel returned no result"
          finish(reject, new Error(`${code}: ${message}`))
          return
        }
        finish(resolve, resp.result)
      } catch (e) {
        finish(reject, e)
      }
    })

    socket.on("error", (e) => finish(reject, e))
    socket.on("close", () => finish(reject, new Error("kernel closed before response")))
    socket.setTimeout(30_000, () => finish(reject, new Error("kernel IPC timeout")))
  })
}

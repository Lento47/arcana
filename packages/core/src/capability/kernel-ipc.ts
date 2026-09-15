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
  decodeFrame,
  encodeFrame,
  FrameError,
  FrameSequencer,
  IPC_PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
} from "./ipc-frame"
import { authorizeProcess } from "./process-gate"
import { buildSandboxProfile, withSandboxProfile, type SandboxBudget } from "./sandbox-profile"
import { bunSpawnExecutor } from "./spawn-executor"

export interface KernelServerOptions {
  /** Listen target: Unix socket path or Windows named pipe (\\.\pipe\name). */
  listenPath: string
  /** Authority database owned by THIS process. */
  dbPath: string
  principalId?: string
  sessionId: string
  skipBootstrap?: boolean
  /** Omitted memory limit keeps only environment filtering; no containment claim. */
  sandboxBudget?: SandboxBudget
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
  const budget = options.sandboxBudget ?? { toolTimeoutMs: 30_000 }
  const profile = buildSandboxProfile(budget)
  const executor = withSandboxProfile(options.spawnExecutor ?? bunSpawnExecutor, budget)

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
        toolInstance?: { toolId: string; origin?: string; schemaHash?: string }
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

      if (payload.toolInstance !== undefined && (
        !payload.toolInstance || typeof payload.toolInstance.toolId !== "string" ||
        (payload.toolInstance.origin !== undefined && typeof payload.toolInstance.origin !== "string") ||
        (payload.toolInstance.schemaHash !== undefined && typeof payload.toolInstance.schemaHash !== "string")
      )) throw new Error("invalid tool instance")

      const result = await authorizeProcess(
        {
          dbPath: options.dbPath,
          sessionId: options.sessionId,
          principalId,
          skipBootstrap: options.skipBootstrap,
          spawnExecutor: executor,
        },
        {
          toolName: payload.toolName ?? "shell",
          argv: payload.argv ?? [],
          cwd: payload.cwd,
          // Bind the filtered replacement environment before authorization.
          env: profile.sanitizeEnv(payload.env),
          nonce: payload.nonce,
          requestedAt: payload.requestedAt,
          requestId: req.id,
          instanceId: req.auth.instanceId,
          toolInstance: payload.toolInstance,
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

export { ipcSpawnViaKernel, type IpcSpawnRequest } from "./kernel-client"

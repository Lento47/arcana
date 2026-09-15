import net from "node:net"
import { randomUUID } from "node:crypto"
import { assertResponseId, decodeFrame, encodeFrame, FrameError, IPC_PROTOCOL_VERSION, MAX_FRAME_BYTES } from "./ipc-frame"
import type { ProcessGateResult } from "./process-gate"

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
  toolInstance?: { toolId: string; origin?: string; schemaHash?: string }
  timeoutMs?: number
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
    const requestId = input.requestId ?? randomUUID()
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
        toolInstance: input.toolInstance,
      },
      auth: { instanceId: input.instanceId ?? "ipc-client" },
    }
    const framed = encodeFrame(req)
    const socket = net.connect(listenPath)
    let acc = Buffer.alloc(0)
    let settled = false

    const finish = (fn: (v: never) => void, v: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.destroy()
      fn(v as never)
    }

    const timeout = setTimeout(() => finish(reject, new Error("kernel IPC timeout; execution outcome may be unknown")), input.timeoutMs ?? 30_000)

    socket.on("connect", () => {
      try {
        socket.write(framed)
      } catch (error) {
        finish(reject, error)
      }
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
        assertResponseId(requestId, resp.id)
        if (resp.ok !== true || !resp.result) {
          const code = resp.error?.code ?? "KERNEL_ERROR"
          const message = resp.error?.message ?? "kernel returned no result"
          finish(reject, new Error(`${code}: ${message}`))
          return
        }
        const result = resp.result
        switch (result.status) {
          case "EXECUTED":
            if (typeof result.stdout !== "string" || typeof result.stderr !== "string" ||
                !(result.exitCode === null || Number.isInteger(result.exitCode)) || typeof result.requestHash !== "string") {
              throw new Error("invalid kernel execution result")
            }
            break
          case "DENIED":
            if (!Array.isArray(result.reasons) || result.reasons.some((r) => !r || typeof r.code !== "string" || typeof r.message !== "string")) throw new Error("invalid kernel denial")
            break
          case "APPROVAL_REQUIRED":
            if (typeof result.message !== "string") throw new Error("invalid kernel approval result")
            break
          case "STALE_DECISION": case "EXHAUSTED": case "UNAVAILABLE": case "CLAIMED": case "EXECUTION_FAILED":
            if (typeof result.detail !== "string") throw new Error("invalid kernel failure result")
            break
          default:
            throw new Error("unknown kernel result status")
        }
        finish(resolve, result)
      } catch (e) {
        finish(reject, e)
      }
    })

    socket.on("error", (e) => finish(reject, e))
    socket.on("close", () => finish(reject, new Error("kernel closed before response")))
  })
}

// packages/core/src/capability/ipc-frame.ts
//
// Authority Kernel S4 M-b — IPC framing codec (pure; no I/O here).
//
// Wire format: 4-byte big-endian length prefix + UTF-8 JSON body.
//
//   Agent → Kernel : Frame<KernelRequest>
//   Kernel → Agent : Frame<KernelResponse> | Frame<KernelError>
//
// Guarantees enforced HERE (transport layer):
//   - version pinning (v1 frames rejected early on mismatch)
//   - max frame size (both directions; oversized = protocol error)
//   - id echo integrity (response id MUST equal request id)
//   - sequence monotonicity per direction (FrameSequencer)
//
// NOT enforced here (kernel policy layer): authorization, replay windows,
// identity binding — those live in the PEP after decode.

import { createHash } from "node:crypto"

export const IPC_PROTOCOL_VERSION = 1
export const MAX_FRAME_BYTES = 4 * 1024 * 1024 // 4 MiB — generous; payloads are summaries

export interface KernelRequest {
  v: typeof IPC_PROTOCOL_VERSION
  id: string
  seq: number
  kind: "process" | "fs" | "network" | "secret"
  /** Gate-specific request object (ProcessGateRequest-shaped per kind). */
  payload: unknown
  auth: { instanceId: string }
}

export interface KernelResponse {
  v: typeof IPC_PROTOCOL_VERSION
  id: string
  ok: boolean
  result?: unknown
  error?: { code: string; message: string }
}

export interface Framed<T> {
  bytes: Buffer
  frame: T
}

export class FrameError extends Error {
  readonly code: "VERSION_MISMATCH" | "OVERSIZE" | "BAD_JSON" | "ID_ECHO_MISMATCH" | "SEQ_REGRESSION"
  constructor(code: FrameError["code"], message: string) {
    super(`${code}: ${message}`)
    this.code = code
    this.name = "FrameError"
  }
}

/** Encode one frame: [u32 BE length][JSON body]. */
export function encodeFrame<T extends { v: number }>(frame: T): Buffer {
  if (frame.v !== IPC_PROTOCOL_VERSION) {
    throw new FrameError("VERSION_MISMATCH", `unsupported protocol version ${frame.v}`)
  }
  const body = Buffer.from(JSON.stringify(frame), "utf-8")
  if (body.length > MAX_FRAME_BYTES) {
    const id = (frame as { id?: unknown }).id
    throw new FrameError("OVERSIZE", `frame ${String(id)} exceeds ${MAX_FRAME_BYTES} bytes`)
  }
  const head = Buffer.alloc(4)
  head.writeUInt32BE(body.length, 0)
  return Buffer.concat([head, body])
}

/**
 * Decode one frame BODY (the u32 length prefix is consumed by the transport
 * reader before this is called). Enforces version before returning.
 */
export function decodeFrame<T>(body: Buffer): T {
  let parsed: { v?: number }
  try {
    parsed = JSON.parse(body.toString("utf-8")) as { v?: number }
  } catch (e) {
    throw new FrameError("BAD_JSON", String(e))
  }
  if (parsed.v !== IPC_PROTOCOL_VERSION) {
    throw new FrameError("VERSION_MISMATCH", `unsupported protocol version ${String(parsed.v)}`)
  }
  return parsed as T
}

/**
 * Per-direction sequence enforcement. The kernel tracks the highest sequence
 * seen from each agent connection; a regression or duplicate is a protocol
 * violation (replay protection lives in the PEP layer, this is transport).
 */
export class FrameSequencer {
  private last: number

  constructor(startAt = 0) {
    this.last = startAt
  }

  next(): number {
    return ++this.last
  }

  /** Returns true when seq strictly advances; false on regression/duplicate. */
  accept(seq: number): boolean {
    if (!Number.isSafeInteger(seq) || seq <= this.last) return false
    this.last = seq
    return true
  }

  get current(): number {
    return this.last
  }
}

/** Reject a response that is not correlated to the outstanding request. */
export function assertResponseId(expected: string, actual: unknown): asserts actual is string {
  if (actual !== expected) {
    throw new FrameError("ID_ECHO_MISMATCH", `expected response id ${expected}, received ${String(actual)}`)
  }
}

/** Deterministic request id (for tests and replay correlation). */
export function frameRequestId(seed: string): string {
  return createHash("sha256").update(`ipc-v1:${seed}`).digest("hex").slice(0, 24)
}

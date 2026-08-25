// packages/core/src/capability/ipc-frame.test.ts
// S4 M-b framing codec tests.
//
// Contract: encodeFrame → [u32 BE length][JSON body]; decodeFrame takes the
// BODY only (the transport reader consumes the prefix). Version pinning,
// oversize-at-encode, malformed-body BAD_JSON, and strict sequence
// monotonicity are enforced here.

import { describe, expect, it } from "bun:test"
import {
  encodeFrame,
  decodeFrame,
  FrameError,
  FrameSequencer,
  assertResponseId,
  frameRequestId,
  IPC_PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
} from "./ipc-frame"

describe("ipc-frame codec", () => {
  const frame = {
    v: IPC_PROTOCOL_VERSION,
    id: "req-1",
    seq: 1,
    kind: "process" as const,
    payload: { toolName: "shell", argv: ["echo", "hi"] },
    auth: { instanceId: "inst-a" },
  }

  it("roundtrips: encode emits [u32 len][body], decode parses body", () => {
    const bytes = encodeFrame(frame)
    expect(bytes.readUInt32BE(0)).toBeGreaterThan(10) // sane prefix
    const decoded = decodeFrame<Record<string, unknown>>(bytes.subarray(4))
    expect(decoded["id"]).toBe(frame.id)
    expect((decoded as Record<string, unknown>)["payload"]).toEqual(frame.payload)
  })

  it("rejects oversized frames at encode time", () => {
    const big = { v: IPC_PROTOCOL_VERSION, id: "x", blob: "y".repeat(MAX_FRAME_BYTES) }
    expect(() => encodeFrame(big as never)).toThrow(FrameError)
  })

  it("decode enforces version before returning", () => {
    const badBody = Buffer.from(JSON.stringify({ v: 99, id: "x" }), "utf-8")
    expect(() => decodeFrame(badBody)).toThrow(FrameError)
    expect(() => decodeFrame(Buffer.from("{not json"))).toThrow(FrameError)
  })

  it("sequencer enforces strict monotonicity per direction", () => {
    const seq = new FrameSequencer()
    expect(seq.accept(1)).toBe(true)
    expect(seq.accept(2)).toBe(true)
    expect(seq.accept(2)).toBe(false) // duplicate
    expect(seq.accept(1)).toBe(false) // regression
    expect(seq.accept(5)).toBe(true) // gap tolerated (loss ≠ replay)
    expect(seq.accept(Number.NaN)).toBe(false)
    expect(seq.current).toBe(5)

    const resumed = new FrameSequencer(10)
    expect(resumed.accept(10)).toBe(false)
    expect(resumed.accept(11)).toBe(true)
  })

  it("rejects a response id that does not echo the request id", () => {
    expect(() => assertResponseId("req-1", "req-2")).toThrow(FrameError)
    expect(() => assertResponseId("req-1", "req-1")).not.toThrow()
  })

  it("frame ids are deterministic from seed", () => {
    expect(frameRequestId("a")).toBe(frameRequestId("a"))
    expect(frameRequestId("a")).not.toBe(frameRequestId("b"))
  })
})

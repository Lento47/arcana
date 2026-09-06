import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import net from "node:net"
import { ipcSpawnViaKernel } from "./kernel-client"
import { createIpcSpawnExecutor, KernelExecutionRejected } from "./ipc-spawn-executor"
import { decodeFrame, encodeFrame, MAX_FRAME_BYTES } from "./ipc-frame"

const executed = { status: "EXECUTED", stdout: "ok", stderr: "", exitCode: 0, requestHash: "hash" }

// Exercise the actual client and codec without opening an OS socket.
async function withPeer(
  respond: (request: Record<string, any>, socket: EventEmitter) => void,
  run: () => Promise<unknown>,
) {
  const original = net.connect
  const socket = new EventEmitter() as net.Socket
  let writes = 0
  socket.destroy = (() => socket) as typeof socket.destroy
  socket.write = ((frame: Buffer) => {
    writes++
    const request = decodeFrame<Record<string, any>>(frame.subarray(4))
    queueMicrotask(() => respond(request, socket))
    return true
  }) as typeof socket.write
  net.connect = (() => {
    queueMicrotask(() => socket.emit("connect"))
    return socket
  }) as typeof net.connect
  try { await run() } finally { net.connect = original }
  return writes
}

const call = () => ipcSpawnViaKernel("test-pipe", { sessionId: "test", argv: ["echo", "ok"], timeoutMs: 100 })

describe("kernel wire client", { concurrency: false }, () => {
  it("decodes fragmented responses and omits an unspecified cwd", async () => {
    await withPeer((req, socket) => {
      assert.equal("cwd" in req.payload, false)
      const bytes = encodeFrame({ v: 1, id: req.id, ok: true, result: executed })
      socket.emit("data", bytes.subarray(0, 2))
      socket.emit("data", bytes.subarray(2, 7))
      socket.emit("data", bytes.subarray(7))
    }, async () => assert.deepEqual(await call(), executed))
  })

  for (const result of [
    { status: "DENIED", reasons: [{ code: "NO_GRANT", message: "denied" }] },
    { status: "APPROVAL_REQUIRED", message: "review exact request" },
    { status: "EXECUTION_FAILED", detail: "failed" },
  ]) {
    it(`preserves ${result.status}; the executor adapter rejects it`, async () => {
      const peer = (req: Record<string, any>, socket: EventEmitter) => socket.emit("data", encodeFrame({ v: 1, id: req.id, ok: true, result }))
      await withPeer(peer, async () => assert.deepEqual(await call(), result))
      await withPeer(peer, async () => assert.rejects(
        async () => createIpcSpawnExecutor({ pipePath: "test-pipe" })(["echo"]),
        (error: unknown) => error instanceof KernelExecutionRejected && error.result.status === result.status,
      ))
    })
  }

  for (const [name, response] of [
    ["kernel error", { ok: false, error: { code: "KERNEL_ERROR", message: "failed" } }],
    ["missing result", { ok: true }],
    ["malformed execution", { ok: true, result: { status: "EXECUTED" } }],
    ["unknown status", { ok: true, result: { status: "SOMETHING_ELSE" } }],
  ] as const) {
    it(`rejects ${name}`, async () => {
      await withPeer((req, socket) => socket.emit("data", encodeFrame({ v: 1, id: req.id, ...response })),
        async () => assert.rejects(call))
    })
  }

  it("snapshots request arguments before connecting", async () => {
    const argv = ["echo", "original"]
    const env = { KEEP: "original" }
    await withPeer((req, socket) => {
      assert.deepEqual(req.payload.argv, ["echo", "original"])
      assert.deepEqual(req.payload.env, { KEEP: "original" })
      socket.emit("data", encodeFrame({ v: 1, id: req.id, ok: true, result: executed }))
    }, async () => {
      const pending = ipcSpawnViaKernel("pipe", { sessionId: "test", argv, env })
      argv[1] = "changed"
      env.KEEP = "changed"
      await pending
    })
  })

  it("rejects a different protocol version", async () => {
    await withPeer((req, socket) => {
      const body = Buffer.from(JSON.stringify({ v: 2, id: req.id, ok: true, result: executed }))
      const prefix = Buffer.alloc(4)
      prefix.writeUInt32BE(body.length)
      socket.emit("data", Buffer.concat([prefix, body]))
    }, async () => assert.rejects(call, /VERSION_MISMATCH/))
  })

  it("rejects an unrelated response id", async () => {
    await withPeer((_, socket) => socket.emit("data", encodeFrame({ v: 1, id: "wrong", ok: true, result: executed })),
      async () => assert.rejects(call, /ID_ECHO_MISMATCH/))
  })

  it("rejects an oversized prefix before waiting for its body", async () => {
    await withPeer((_, socket) => {
      const prefix = Buffer.alloc(4)
      prefix.writeUInt32BE(MAX_FRAME_BYTES + 1)
      socket.emit("data", prefix)
    }, async () => assert.rejects(call, /OVERSIZE/))
  })

  it("times out without retransmitting an uncertain operation", async () => {
    const writes = await withPeer(() => {}, async () => assert.rejects(call, /outcome may be unknown/))
    assert.equal(writes, 1)
  })

  it("rejects a closed connection", async () => {
    await withPeer((_, socket) => socket.emit("close"), async () => assert.rejects(call, /closed/))
  })
})

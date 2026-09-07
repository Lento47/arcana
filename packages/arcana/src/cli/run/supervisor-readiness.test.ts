import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import net from "node:net"
import { syncBuiltinESMExports } from "node:module"
import { defaultKernelListenPath, waitForKernelReady } from "./supervisor"

async function withConnections(onConnect: (socket: EventEmitter, attempt: number) => void, run: () => Promise<void>) {
  const original = net.connect
  let attempts = 0
  net.connect = (() => {
    const socket = new EventEmitter() as net.Socket
    socket.destroy = (() => socket) as typeof socket.destroy
    queueMicrotask(() => onConnect(socket, ++attempts))
    return socket
  }) as typeof net.connect
  syncBuiltinESMExports()
  try { await run() } finally { net.connect = original; syncBuiltinESMExports() }
  return attempts
}

describe("kernel readiness", { concurrency: false }, () => {
  it("waits through a refused connection until the kernel is listening", async () => {
    const attempts = await withConnections((socket, attempt) => socket.emit(attempt === 1 ? "error" : "connect"),
      async () => waitForKernelReady("pipe", 1000))
    assert.equal(attempts, 2)
  })
  it("bounds an unresponsive connection", async () => {
    await withConnections(() => {}, async () => assert.rejects(waitForKernelReady("pipe", 10), /not ready/))
  })
  it("cancels startup promptly", async () => {
    const abort = new AbortController()
    await withConnections(() => abort.abort(), async () => assert.rejects(waitForKernelReady("pipe", 1000, abort.signal), /cancelled/))
  })
  it("makes endpoint names bounded and safe for path-like session identifiers", () => {
    const endpoint = defaultKernelListenPath("../unsafe/".repeat(100))
    assert.equal(endpoint.includes("unsafe"), false)
    assert.notEqual(endpoint, defaultKernelListenPath("another-session"))
  })
})

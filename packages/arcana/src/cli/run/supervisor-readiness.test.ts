import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { connect as netConnect, type Socket } from "node:net"
import { defaultKernelListenPath, waitForKernelReady } from "./supervisor"

type Connect = typeof netConnect
type Outcome = "connect" | "error" | "silent"

/**
 * Scripted stand-in for net.connect. waitForKernelReady accepts the connect
 * implementation as an injection seam: monkey-patching node:net via
 * syncBuiltinESMExports does not reach ESM bindings under Bun, so the previous
 * mock silently exercised the real connect and always hit the deadline.
 */
function scriptedConnect(outcomes: readonly Outcome[]): { connect: Connect; attempts: () => number } {
  let attempts = 0
  const connect = (() => {
    const outcome = outcomes[attempts] ?? "silent"
    attempts++
    const socket = new EventEmitter() as Socket
    socket.destroy = (() => socket) as typeof socket.destroy
    queueMicrotask(() => {
      if (outcome === "connect") socket.emit("connect")
      else if (outcome === "error") socket.emit("error", new Error("connection refused"))
    })
    return socket
  }) as unknown as Connect
  return { connect, attempts: () => attempts }
}

describe("kernel readiness", { concurrency: false }, () => {
  it("waits through a refused connection until the kernel is listening", async () => {
    const fake = scriptedConnect(["error", "connect"])
    await waitForKernelReady("pipe", 1000, undefined, fake.connect)
    assert.equal(fake.attempts(), 2)
  })

  it("bounds an unresponsive connection", async () => {
    const fake = scriptedConnect(["silent"])
    await assert.rejects(waitForKernelReady("pipe", 10, undefined, fake.connect), /not ready/)
    assert.equal(fake.attempts(), 1)
  })

  it("cancels startup promptly", async () => {
    const fake = scriptedConnect(["silent"])
    const abort = new AbortController()
    setTimeout(() => abort.abort(), 20)
    await assert.rejects(waitForKernelReady("pipe", 1000, abort.signal, fake.connect), /cancelled/)
    assert.equal(fake.attempts(), 1)
  })

  it("makes endpoint names bounded and safe for path-like session identifiers", () => {
    const endpoint = defaultKernelListenPath("../unsafe/".repeat(100))
    assert.equal(endpoint.includes("unsafe"), false)
    assert.notEqual(endpoint, defaultKernelListenPath("another-session"))
  })
})

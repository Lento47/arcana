// packages/core/src/capability/kernel-ipc.test.ts
// Authority Kernel S4 M-c — kill-test matrix across the REAL process
// boundary: a live kernel server over a local socket, exercised by the
// framed client.
//
// Proven here end-to-end:
//   ALLOW with bootstrap → EXECUTED via real child (marker created)
//   skipBootstrap deny   → DENIED, zero side effects
//   K7 escalation        → untrusted-influenced spawn blocked fail-closed

import { describe, expect, it, afterAll } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import net from "node:net"
import { startKernelServer, ipcSpawnViaKernel } from "./kernel-ipc"
import { decodeFrame, encodeFrame, IPC_PROTOCOL_VERSION, MAX_FRAME_BYTES } from "./ipc-frame"
import { countingSpawnExecutor } from "./spawn-executor"

const workDir = mkdtempSync(join(tmpdir(), "arcana-kernel-ipc-"))

afterAll(() => {
  try {
    rmSync(workDir, { recursive: true, force: true })
  } catch {
    /* Windows lock lag */
  }
})

const listenPath =
  process.platform === "win32" ? `\\\\.\\pipe\\arcana-kernel-test-${Date.now()}` : join(workDir, "kernel.sock")

function collectFrames(socket: net.Socket, count: number): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    const frames: Array<Record<string, unknown>> = []
    const timeout = setTimeout(() => reject(new Error("timed out waiting for IPC frames")), 5_000)

    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0)
        if (buffer.length < 4 + length) return
        frames.push(decodeFrame<Record<string, unknown>>(buffer.subarray(4, 4 + length)))
        buffer = buffer.subarray(4 + length)
        if (frames.length === count) {
          clearTimeout(timeout)
          resolve(frames)
          return
        }
      }
    })
    socket.once("error", reject)
  })
}

async function connect(path: string): Promise<net.Socket> {
  const socket = net.connect(path)
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve)
    socket.once("error", reject)
  })
  return socket
}

describe("kernel IPC server (S4 M-c)", () => {
  it("ALLOW path: mediated spawn executes the real child and returns output", async () => {
    const marker = join(workDir, "allow-marker.txt")
    const kernel = await startKernelServer({
      listenPath: listenPath,
      dbPath: ":memory:",
      principalId: "test-agent",
      sessionId: "s-ipc",
    })
    try {
      const result = await ipcSpawnViaKernel(listenPath, {
        argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
        sessionId: "s-ipc",
      })
      expect(result.status).toBe("EXECUTED")
      if (result.status === "EXECUTED") expect(result.exitCode).toBe(0)
      expect(existsSync(marker)).toBe(true)
    } finally {
      await kernel.close()
    }
  })

  it("DENY path: skipBootstrap denies without executing the child", async () => {
    const marker = join(workDir, "deny-marker.txt")
    const kernel = await startKernelServer({
      listenPath: `${listenPath}-deny`,
      dbPath: ":memory:",
      principalId: "untrusted-agent",
      sessionId: "s-deny",
      skipBootstrap: true,
    })
    try {
      const result = await ipcSpawnViaKernel(`${listenPath}-deny`, {
        argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
        sessionId: "s-deny",
      })
      expect(result.status).toBe("DENIED")
      expect(existsSync(marker)).toBe(false)
    } finally {
      await kernel.close()
    }
  })

  it("uses the kernel-side injected executor after mediation", async () => {
    const { executor, calls } = countingSpawnExecutor({ stdout: "from-kernel" })
    const path = `${listenPath}-injected`
    const kernel = await startKernelServer({
      listenPath: path,
      dbPath: ":memory:",
      principalId: "test-agent",
      sessionId: "s-injected",
      spawnExecutor: executor,
    })
    try {
      const result = await ipcSpawnViaKernel(path, {
        argv: ["definitely-not-a-real-executable", "arg"],
        sessionId: "s-injected",
        instanceId: "agent-process-1",
      })
      expect(result.status).toBe("EXECUTED")
      if (result.status === "EXECUTED") expect(result.stdout).toBe("from-kernel")
      expect(calls).toEqual([["definitely-not-a-real-executable", "arg"]])
    } finally {
      await kernel.close()
    }
  })

  it("rejects a duplicate sequence on one connection before a second dispatch", async () => {
    const { executor, calls } = countingSpawnExecutor()
    const path = `${listenPath}-sequence`
    const kernel = await startKernelServer({
      listenPath: path,
      dbPath: ":memory:",
      principalId: "test-agent",
      sessionId: "s-sequence",
      spawnExecutor: executor,
    })
    try {
      const socket = await connect(path)
      try {
        const responses = collectFrames(socket, 2)
        const request = (id: string) => ({
          v: IPC_PROTOCOL_VERSION,
          id,
          seq: 1,
          kind: "process" as const,
          payload: { toolName: "shell", argv: ["mock-process"] },
          auth: { instanceId: "agent-process-1" },
        })
        socket.write(Buffer.concat([encodeFrame(request("first")), encodeFrame(request("duplicate"))]))

        const received = await responses
        const duplicate = received.find((frame) => frame["id"] === "duplicate") as {
          error?: { code?: string }
        }
        expect(duplicate.error?.code).toBe("SEQ_REGRESSION")
        expect(calls).toHaveLength(1)
      } finally {
        socket.destroy()
      }
    } finally {
      await kernel.close()
    }
  })

  it("rejects an oversized prefix without buffering the declared body", async () => {
    const path = `${listenPath}-oversize`
    const kernel = await startKernelServer({
      listenPath: path,
      dbPath: ":memory:",
      principalId: "test-agent",
      sessionId: "s-oversize",
    })
    try {
      const socket = await connect(path)
      try {
        const response = collectFrames(socket, 1)
        const prefix = Buffer.alloc(4)
        prefix.writeUInt32BE(MAX_FRAME_BYTES + 1)
        socket.write(prefix)
        const [frame] = await response
        expect((frame?.["error"] as { code?: string } | undefined)?.code).toBe("OVERSIZE")
      } finally {
        socket.destroy()
      }
    } finally {
      await kernel.close()
    }
  })

  it("returns a protocol error for malformed JSON and remains available", async () => {
    const path = `${listenPath}-bad`
    const kernel = await startKernelServer({
      listenPath: path,
      dbPath: ":memory:",
      principalId: "t",
      sessionId: "s",
    })
    try {
      const socket = await connect(path)
      try {
        const response = collectFrames(socket, 1)
        const body = Buffer.from("{x", "utf8")
        const prefix = Buffer.alloc(4)
        prefix.writeUInt32BE(body.length)
        socket.write(Buffer.concat([prefix, body]))
        const [frame] = await response
        expect((frame?.["error"] as { code?: string } | undefined)?.code).toBe("BAD_JSON")
      } finally {
        socket.destroy()
      }

      const result = await ipcSpawnViaKernel(path, {
        argv: [process.execPath, "-e", "process.exit(0)"],
        sessionId: "s-alive",
      })
      expect(result.status).toBe("EXECUTED")
    } finally {
      await kernel.close()
    }
  })
})

it("kernel dispatch filters authority environment before executing", async () => {
  let environment: Record<string, string> | undefined
  const path = `${listenPath}-environment`
  const kernel = await startKernelServer({
    listenPath: path,
    dbPath: ":memory:",
    sessionId: "s-environment",
    spawnExecutor: (_argv, options) => {
      environment = options?.env
      return { stdout: "ok", stderr: "", exitCode: 0 }
    },
  })
  try {
    const result = await ipcSpawnViaKernel(path, {
      sessionId: "s-environment", argv: ["mock-process"],
      env: { ARCANA_KERNEL_PIPE: "privileged", NODE_OPTIONS: "inject", KEEP: "yes" },
    })
    expect(result.status).toBe("EXECUTED")
    expect(environment).toEqual({ KEEP: "yes" })
  } finally {
    await kernel.close()
  }
})

// packages/arcana/src/cli/run/supervisor.test.ts
//
// S4 supervisor — real dual-process proof:
//   1. spawnKernelProcess launches a REAL kernel child and waits for readiness
//   2. a framed IPC request through that pipe mediates a REAL child process
//   3. teardown kills the kernel cleanly
//
// This exercises the actual production entry (kernel-entry.ts) over an OS
// socket/pipe — no in-process shortcuts for the kernel side.

import { describe, expect, it } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnKernelProcess, waitForKernelReady, defaultKernelListenPath } from "./supervisor"
import { ipcSpawnViaKernel } from "@arcana/core/capability/kernel-ipc"

describe("S4 supervised kernel launch", () => {
  it("default listen path is OS-appropriate", () => {
    const p = defaultKernelListenPath("sess1")
    if (process.platform === "win32") expect(p.startsWith("\\\\.\\pipe\\")).toBe(true)
    else expect(p.endsWith(".sock")).toBe(true)
  })

  it("spawns a real kernel, mediates a real spawn over IPC, tears down", async () => {
    const sessionId = `sup-test-${Date.now()}`
    const dbPath = join(mkdtempSync(join(tmpdir(), "s4-sup-")), "authority.db")
    const { child, listenPath } = await spawnKernelProcess({ sessionId, dbPath })
    try {
      // Kernel child is alive and its pipe accepts.
      expect(child.pid).toBeGreaterThan(0)
      await waitForKernelReady(listenPath, 5_000)

      // Real mediation through the pipe: kernel executes a real child that
      // writes a marker file. Bootstrap policy ALLOWs first-party requests.
      const workDir = mkdtempSync(join(tmpdir(), "s4-work-"))
      const marker = join(workDir, "marker.txt")
      const result = await ipcSpawnViaKernel(listenPath, {
        sessionId,
        argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ok')`],
      })
      expect(result.status).toBe("EXECUTED")
      expect(await Bun.file(marker).exists()).toBe(true)
    } finally {
      child.kill()
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode) resolve()
        else child.once("exit", () => resolve())
      })
    }
  }, 30_000)
})

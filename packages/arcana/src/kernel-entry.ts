// packages/arcana/src/kernel-entry.ts
//
// Authority Kernel S4 M-d — standalone kernel server entry point.
// Run with: bun run packages/arcana/src/kernel-entry.ts
//
// Binds a local socket/pipe and mediates effect requests from agent
// processes. The workspace .arcana/authority.db is owned by THIS process.

import { startKernelServer } from "@arcana/core/capability/kernel-ipc"
import { join } from "node:path"
import { homedir } from "node:os"

const listenPath =
  process.env.ARCANA_KERNEL_PIPE ??
  (process.platform === "win32"
    ? `\\\\.\\pipe\\arcana-kernel-${process.pid}`
    : join(homedir(), ".arcana", `kernel-${process.pid}.sock`))

const dbPath = process.env.ARCANA_AUTHORITY_DB
  ?? join(process.cwd(), ".arcana", "authority.db")

const sessionId = process.env.ARCANA_SESSION_ID ?? "kernel-default"

console.log(`[kernel] starting on ${listenPath}`)
console.log(`[kernel] authority db: ${dbPath}`)

const handle = await startKernelServer({
  listenPath,
  dbPath,
  sessionId,
})

console.log(`[kernel] listening on ${handle.path}`)

process.on("SIGINT", async () => {
  console.log("[kernel] shutting down")
  await handle.close()
  process.exit(0)
})

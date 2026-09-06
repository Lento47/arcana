// packages/arcana/src/kernel-entry.ts
//
// Authority Kernel S4 M-d — standalone kernel server entry point.
// Run with: bun run packages/arcana/src/kernel-entry.ts
//
// Binds a local socket/pipe and mediates effect requests from agent
// processes. The workspace .arcana/authority.db is owned by THIS process.

import { buildSandboxProfile } from "@arcana/core/capability/sandbox-profile"
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

console.error(`[kernel] starting on ${listenPath}`)
console.error(`[kernel] authority db: ${dbPath}`)

const sandboxBudget = {
  maxMemoryMB: process.env.ARCANA_KERNEL_MAX_MEMORY_MB === undefined
    ? undefined : Number(process.env.ARCANA_KERNEL_MAX_MEMORY_MB),
  toolTimeoutMs: 30_000,
}
console.error(`[kernel] restrictions: ${JSON.stringify(buildSandboxProfile(sandboxBudget).enforcement())}`)

const handle = await startKernelServer({
  listenPath,
  dbPath,
  sessionId,
  sandboxBudget,
})

console.error(`[kernel] listening on ${handle.path}`)

const shutdown = async () => {
  console.error("[kernel] shutting down")
  await handle.close()
  process.exit(0)
}
process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)

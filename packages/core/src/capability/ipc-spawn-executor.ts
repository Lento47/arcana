import type { SpawnExecutor } from "./spawn-executor"
import type { ProcessGateResult } from "./process-gate"
import { ipcSpawnViaKernel } from "./kernel-client"

export interface IpcSpawnExecutorOptions {
  pipePath: string
  instanceId?: string
  timeoutMs?: number
  toolName?: string
}

/** A denied remote operation must never become a successful local receipt. */
export class KernelExecutionRejected extends Error {
  constructor(readonly result: Exclude<ProcessGateResult, { status: "EXECUTED" }>) {
    super(`kernel did not execute: ${result.status}`)
    this.name = "KernelExecutionRejected"
  }
}

/** Compatibility adapter for callers that require a SpawnExecutor. */
export function createIpcSpawnExecutor(opts: IpcSpawnExecutorOptions): SpawnExecutor {
  return async (argv, spawnOpts) => {
    const result = await ipcSpawnViaKernel(opts.pipePath, {
      sessionId: "ipc",
      instanceId: opts.instanceId,
      toolName: opts.toolName ?? "shell",
      argv,
      cwd: spawnOpts?.cwd,
      env: spawnOpts?.env,
      timeoutMs: opts.timeoutMs,
    })
    if (result.status !== "EXECUTED") throw new KernelExecutionRejected(result)
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
  }
}

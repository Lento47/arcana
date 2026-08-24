// packages/core/src/capability/spawn-executor.ts
//
// Authority Kernel S4/M-a — the spawn-executor SEAM.
//
// The gate calls this interface; it never touches Bun.spawnSync directly.
// Today the only implementation is the in-process Bun executor. At S4 the
// same interface is fulfilled by an IPC client that serializes the request
// to the privileged kernel process — making "zero OS children without
// authority" DIRECTLY testable via a counting/failing executor.
//
// Contract (matches current executeExact behavior exactly):
//   - stdout/stderr decoded utf-8
//   - env: when provided, REPLACES inherited environment (undefined dropped)

export interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface SpawnExecutor {
  (argv: string[], opts?: { cwd?: string; env?: Record<string, string> }): SpawnResult
}

/** In-process executor — current production behavior, moved verbatim. */
export const bunSpawnExecutor: SpawnExecutor = (argv, opts) => {
  const spawned = Bun.spawnSync({
    cmd: argv,
    cwd: opts?.cwd ?? undefined,
    stdout: "pipe",
    stderr: "pipe",
    env: opts?.env,
  })
  return {
    stdout: new TextDecoder().decode(spawned.stdout),
    stderr: new TextDecoder().decode(spawned.stderr),
    exitCode: spawned.exitCode,
  }
}

/** Test double: counts invocations, never spawns. */
export function countingSpawnExecutor(
  result: Partial<SpawnResult> = {},
): { executor: SpawnExecutor; calls: string[][] } {
  const calls: string[][] = []
  const executor: SpawnExecutor = (argv) => {
    calls.push([...argv])
    return { stdout: "", stderr: "", exitCode: 0, ...result }
  }
  return { executor, calls }
}

/**
 * Process-level tool admission pools + path locks for multi-tool turns.
 *
 * Phase 1: tier semaphores (read/network/write/shell).
 * Phase 2: exclusive path locks for write tools so WRITE_CONCURRENCY can be > 1
 * for disjoint paths without corrupting the same file.
 *
 * Limits (env-overridable):
 *   ARCANA_TOOL_READ_CONCURRENCY (default 8)
 *   ARCANA_TOOL_NETWORK_CONCURRENCY (default 4)
 *   ARCANA_TOOL_WRITE_CONCURRENCY (default 4)  // was 1 before path locks
 *   ARCANA_TOOL_SHELL_CONCURRENCY (default 1)
 */
import { Effect, Semaphore } from "effect"
import { setToolActivityHint } from "@arcana/core/tool/activity-hint"
import { classifyToolName, type ToolCapability } from "./classify"
import { withPathLocks } from "./path-lock"
import { extractLockedPaths } from "./paths"
import { formatEngineCapabilityHint } from "./report"

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

const limits: Record<ToolCapability, number> = {
  read: envInt("ARCANA_TOOL_READ_CONCURRENCY", 8),
  network: envInt("ARCANA_TOOL_NETWORK_CONCURRENCY", 4),
  write: envInt("ARCANA_TOOL_WRITE_CONCURRENCY", 4),
  verify: envInt("ARCANA_TOOL_WRITE_CONCURRENCY", 4),
  shell: envInt("ARCANA_TOOL_SHELL_CONCURRENCY", 1),
  model: 1,
  unknown: 1,
}

const pools: Record<ToolCapability, Semaphore.Semaphore> = {
  read: Semaphore.makeUnsafe(limits.read),
  network: Semaphore.makeUnsafe(limits.network),
  write: Semaphore.makeUnsafe(limits.write),
  verify: Semaphore.makeUnsafe(limits.verify),
  shell: Semaphore.makeUnsafe(limits.shell),
  model: Semaphore.makeUnsafe(limits.model),
  unknown: Semaphore.makeUnsafe(limits.unknown),
}

/** Active tool count (test instrumentation). */
let activeTools = 0
let maxActiveTools = 0
/** Names of tools currently holding admission (for proof-tape hint). */
const activeNames = new Set<string>()

export function toolAdmissionStats() {
  return { active: activeTools, maxActive: maxActiveTools, limits: { ...limits } }
}

export function resetToolAdmissionStatsForTest() {
  activeTools = 0
  maxActiveTools = 0
  activeNames.clear()
}

function publishActivityHint() {
  if (activeNames.size === 0) {
    setToolActivityHint(undefined)
    return
  }
  const hint = formatEngineCapabilityHint([...activeNames])
  setToolActivityHint(hint, { ttlMs: 10_000, source: "engine" })
}

export type AdmissionOptions = {
  /** Tool args — used to extract write paths for path locks. */
  input?: unknown
  /** Explicit paths to lock (overrides extraction). */
  paths?: string[]
}

/**
 * Run an Effect under the capability pool (+ path locks for writes).
 */
export function withToolAdmission<A, E, R>(
  toolName: string,
  effect: Effect.Effect<A, E, R>,
  options: AdmissionOptions = {},
): Effect.Effect<A, E, R> {
  const capability = classifyToolName(toolName)
  const pool = pools[capability]
  const paths =
    options.paths ??
    (capability === "write" ? extractLockedPaths(toolName, options.input) : [])

  const gated = pool.withPermits(1)(
    Effect.gen(function* () {
      activeTools++
      maxActiveTools = Math.max(maxActiveTools, activeTools)
      activeNames.add(toolName)
      publishActivityHint()
      return yield* effect.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            activeTools = Math.max(0, activeTools - 1)
            activeNames.delete(toolName)
            publishActivityHint()
          }),
        ),
      )
    }),
  )

  return withPathLocks(paths, gated)
}

/**
 * Promise wrapper for hosts that are not Effect-native (e.g. AI SDK execute).
 */
export async function withToolAdmissionPromise<T>(
  toolName: string,
  run: () => Promise<T>,
  options: AdmissionOptions = {},
): Promise<T> {
  return Effect.runPromise(
    withToolAdmission(
      toolName,
      Effect.tryPromise({
        try: run,
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }),
      options,
    ),
  )
}

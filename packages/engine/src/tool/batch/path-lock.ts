/**
 * Process-local exclusive locks per canonical path (Phase 2).
 * Disjoint paths run in parallel; same path serializes.
 * Lock acquisition order is sorted to avoid deadlock.
 */
import { Effect } from "effect"
import { KeyedMutex } from "@arcana/core/effect/keyed-mutex"
import { canonicalizePath } from "./paths"

const mutex = KeyedMutex.makeUnsafe<string>()

/** Active path-lock keys (test instrumentation). */
const held = new Set<string>()

export function pathLockStats() {
  return { held: held.size, keys: [...held] }
}

export function resetPathLockStatsForTest() {
  held.clear()
}

/**
 * Run `effect` while holding exclusive locks on all paths (sorted).
 */
export function withPathLocks<A, E, R>(
  paths: string[],
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  const keys = [...new Set(paths.map(canonicalizePath).filter(Boolean))].sort()
  if (keys.length === 0) return effect

  return keys.reduceRight(
    (acc, key) =>
      mutex.withLock(key)(
        Effect.gen(function* () {
          held.add(key)
          return yield* acc.pipe(
            Effect.ensuring(
              Effect.sync(() => {
                held.delete(key)
              }),
            ),
          )
        }),
      ),
    effect,
  )
}

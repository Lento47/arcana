/**
 * Phase C: Child Launch Barrier
 *
 * Controls when a delegated child session can begin executing.
 * A child must not execute consequential tools before its capability
 * grants are activated. The barrier enforces this by gating execution
 * on a READY signal that is only emitted after all expected grants
 * have been atomically activated.
 *
 * Lifecycle:
 *   register → AUTHORITY_PENDING → (markReady / markFailed) → READY / FAILED
 *                                  ↑ waiters blocked here
 */

import { Effect } from "effect"

// ─── Types ────────────────────────────────────────────────────────────

export type ChildRuntimeStatus =
  | "ALLOCATED"
  | "STARTING"
  | "AUTHORITY_PENDING"
  | "READY"
  | "FAILED"
  | "TERMINATED"

export class ChildLaunchError {
  readonly _tag = "ChildLaunchError" as const
  constructor(
    readonly childSessionId: string,
    readonly reason: string,
  ) {}
}

export interface ChildLaunchBarrier {
  /**
   * Wait until the child session is READY.
   * Returns immediately if already READY.
   * Fails if the child is FAILED, TERMINATED, or times out.
   */
  waitUntilReady(
    childSessionId: string,
    timeoutMs?: number,
  ): Effect.Effect<void, ChildLaunchError>

  /**
   * Mark a child session as READY after successful grant activation.
   * Verifies the child is in AUTHORITY_PENDING state.
   * Records the activated grant IDs.
   */
  markReady(
    childSessionId: string,
    activatedGrantIds: readonly string[],
  ): Effect.Effect<void, ChildLaunchError>

  /**
   * Mark a child session as FAILED.
   * Releases any waiters with an error.
   */
  markFailed(
    childSessionId: string,
    reason: string,
  ): Effect.Effect<void, never>

  /**
   * Register a child session in AUTHORITY_PENDING state.
   */
  register(
    childSessionId: string,
    childPrincipalId: string,
    parentSessionId: string,
    expectedGrantIds: readonly string[],
  ): Effect.Effect<void, ChildLaunchError>

  /**
   * Get the current status of a child session.
   */
  getStatus(
    childSessionId: string,
  ): Effect.Effect<ChildRuntimeStatus | undefined, never>

  /**
   * Get the activated grant IDs for a READY child.
   * Returns undefined if not READY.
   */
  getActivatedGrantIds(
    childSessionId: string,
  ): Effect.Effect<readonly string[] | undefined, never>
}

// ─── Internal Entry ───────────────────────────────────────────────────

interface Waiter {
  resolve: () => void
  reject: (err: ChildLaunchError) => void
}

interface ChildSessionEntry {
  status: ChildRuntimeStatus
  childPrincipalId: string
  parentSessionId: string
  expectedGrantIds: readonly string[]
  activatedGrantIds: readonly string[]
  failureReason: string | undefined
  waiters: Waiter[]
}

// ─── Helpers ──────────────────────────────────────────────────────────

function setEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  for (const id of b) {
    if (!setA.has(id)) return false
  }
  return true
}

// ─── In-Memory Implementation ─────────────────────────────────────────

export class InMemoryChildLaunchBarrier implements ChildLaunchBarrier {
  private readonly entries = new Map<string, ChildSessionEntry>()

  register(
    childSessionId: string,
    childPrincipalId: string,
    parentSessionId: string,
    expectedGrantIds: readonly string[],
  ): Effect.Effect<void, ChildLaunchError> {
    return Effect.gen((function* (this: InMemoryChildLaunchBarrier) {
      if (this.entries.has(childSessionId)) {
        yield* Effect.fail(
          new ChildLaunchError(
            childSessionId,
            `Child session already registered: ${childSessionId}`,
          ),
        )
      }

      this.entries.set(childSessionId, {
        status: "AUTHORITY_PENDING",
        childPrincipalId,
        parentSessionId,
        expectedGrantIds,
        activatedGrantIds: [],
        failureReason: undefined,
        waiters: [],
      })
    }).bind(this))
  }

  waitUntilReady(
    childSessionId: string,
    timeoutMs: number = 5_000,
  ): Effect.Effect<void, ChildLaunchError> {
    return Effect.gen((function* (this: InMemoryChildLaunchBarrier) {
      const entry = this.entries.get(childSessionId)

      if (!entry) {
        yield* Effect.fail(
          new ChildLaunchError(
            childSessionId,
            `Child session not registered: ${childSessionId}`,
          ),
        )
        return // unreachable but satisfies TS
      }

      // If already READY, return immediately
      if (entry.status === "READY") {
        return
      }

      // If already FAILED or TERMINATED, fail immediately
      if (entry.status === "FAILED" || entry.status === "TERMINATED") {
        yield* Effect.fail(
          new ChildLaunchError(
            childSessionId,
            entry.failureReason ?? `Child session in terminal state: ${entry.status}`,
          ),
        )
        return
      }

      // Otherwise, wait for the barrier to be released via a Promise
      yield* Effect.tryPromise({
        try: () =>
          new Promise<void>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> | undefined

            const waiter: Waiter = {
              resolve: () => {
                if (timer !== undefined) clearTimeout(timer)
                resolve()
              },
              reject: (err) => {
                if (timer !== undefined) clearTimeout(timer)
                reject(err)
              },
            }

            entry.waiters.push(waiter)

            timer = setTimeout(() => {
              // Remove this waiter from the array
              const idx = entry.waiters.indexOf(waiter)
              if (idx !== -1) entry.waiters.splice(idx, 1)
              reject(
                new ChildLaunchError(
                  childSessionId,
                  `Timed out waiting for child session to become READY after ${timeoutMs}ms`,
                ),
              )
            }, timeoutMs)
          }),
        catch: (unknownError) =>
          unknownError instanceof ChildLaunchError
            ? unknownError
            : new ChildLaunchError(
                childSessionId,
                String(unknownError),
              ),
      })
    }).bind(this))
  }

  markReady(
    childSessionId: string,
    activatedGrantIds: readonly string[],
  ): Effect.Effect<void, ChildLaunchError> {
    return Effect.gen((function* (this: InMemoryChildLaunchBarrier) {
      const entry = this.entries.get(childSessionId)

      if (!entry) {
        yield* Effect.fail(
          new ChildLaunchError(
            childSessionId,
            `Child session not registered: ${childSessionId}`,
          ),
        )
        return
      }

      if (entry.status !== "AUTHORITY_PENDING") {
        yield* Effect.fail(
          new ChildLaunchError(
            childSessionId,
            `Cannot mark READY: expected AUTHORITY_PENDING but was ${entry.status}`,
          ),
        )
        return
      }

      // Verify expected grant IDs match activated grant IDs
      if (!setEqual(entry.expectedGrantIds, activatedGrantIds)) {
        yield* Effect.fail(
          new ChildLaunchError(
            childSessionId,
            `Grant ID mismatch: expected [${entry.expectedGrantIds.join(",")}] but got [${activatedGrantIds.join(",")}]`,
          ),
        )
        return
      }

      // Transition to READY
      entry.status = "READY"
      entry.activatedGrantIds = activatedGrantIds

      // Release all waiters
      const waiters = entry.waiters.splice(0)
      for (const w of waiters) {
        w.resolve()
      }
    }).bind(this))
  }

  markFailed(
    childSessionId: string,
    reason: string,
  ): Effect.Effect<void, never> {
    return Effect.sync(() => {
      const entry = this.entries.get(childSessionId)
      if (!entry) return

      entry.status = "FAILED"
      entry.failureReason = reason

      // Reject all waiters
      const waiters = entry.waiters.splice(0)
      for (const w of waiters) {
        w.reject(new ChildLaunchError(childSessionId, reason))
      }
    })
  }

  getStatus(
    childSessionId: string,
  ): Effect.Effect<ChildRuntimeStatus | undefined, never> {
    return Effect.sync(() => {
      return this.entries.get(childSessionId)?.status
    })
  }

  getActivatedGrantIds(
    childSessionId: string,
  ): Effect.Effect<readonly string[] | undefined, never> {
    return Effect.sync(() => {
      const entry = this.entries.get(childSessionId)
      if (!entry || entry.status !== "READY") return undefined
      return entry.activatedGrantIds
    })
  }
}

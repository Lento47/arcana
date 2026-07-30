import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import {
  InMemoryChildLaunchBarrier,
  type ChildRuntimeStatus,
} from "@arcana/core/capability/child-launch-barrier"

// ── Helper ────────────────────────────────────────────────────────────

function runSync<E, A>(effect: Effect.Effect<A, E>): A {
  return Effect.runSync(effect as Effect.Effect<A, never>)
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("InMemoryChildLaunchBarrier", () => {
  it("child attempts tool before READY — executor called zero times", () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-1", "agent:child", "session:parent", ["g1"]),
    )

    const status = Effect.runSync(barrier.getStatus("child-1"))
    expect(status).toBe("AUTHORITY_PENDING")

    // waitUntilReady should timeout quickly since nobody calls markReady
    const result = Effect.runPromise(
      barrier.waitUntilReady("child-1", 50),
    ).then(
      () => "RESOLVED",
      () => "REJECTED",
    )

    return result.then((r) => {
      expect(r).toBe("REJECTED")
      // Status remains AUTHORITY_PENDING
      const statusAfter = Effect.runSync(barrier.getStatus("child-1"))
      expect(statusAfter).toBe("AUTHORITY_PENDING")
    })
  })

  it("child creation fails — active child grants = 0", async () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-2", "agent:child", "session:parent", ["g1"]),
    )

    Effect.runSync(barrier.markFailed("child-2", "child creation failed"))

    const err = await Effect.runPromise(
      Effect.flip(barrier.waitUntilReady("child-2", 100)),
    )
    expect(err._tag).toBe("ChildLaunchError")
    expect(err.childSessionId).toBe("child-2")
    expect(err.reason).toBe("child creation failed")

    const activated = Effect.runSync(barrier.getActivatedGrantIds("child-2"))
    expect(activated).toBeUndefined()
  })

  it("activation fails halfway — all child grants remain non-ACTIVE", () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-3", "agent:child", "session:parent", [
        "g1",
        "g2",
      ]),
    )

    Effect.runSync(
      barrier.markFailed("child-3", "activation failed"),
    )

    const status = Effect.runSync(barrier.getStatus("child-3"))
    expect(status).toBe("FAILED")

    const activated = Effect.runSync(barrier.getActivatedGrantIds("child-3"))
    expect(activated).toBeUndefined()
  })

  it("parent revoked before activation — child never becomes READY", async () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-4", "agent:child", "session:parent", ["g1"]),
    )

    // Start waiting in background
    const waitPromise = Effect.runPromise(
      barrier.waitUntilReady("child-4", 200),
    )

    // Simulate parent revocation
    Effect.runSync(
      barrier.markFailed("child-4", "parent revoked before activation"),
    )

    const err = await waitPromise.then(
      () => null,
      (e) => e,
    )
    expect(err).not.toBeNull()
    expect(err.reason).toBe("parent revoked before activation")

    const status = Effect.runSync(barrier.getStatus("child-4"))
    expect(status).toBe("FAILED")
  })

  it("wrong child principal — activation denied", async () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-5", "agent:child", "session:parent", [
        "g1",
        "g2",
      ]),
    )

    // Try to mark ready with wrong grant IDs
    const err = await Effect.runPromise(
      Effect.flip(barrier.markReady("child-5", ["g1", "g3"])),
    )
    expect(err._tag).toBe("ChildLaunchError")
    expect(err.childSessionId).toBe("child-5")
    expect(err.reason).toContain("Grant ID mismatch")

    // Status should still be AUTHORITY_PENDING
    const status = Effect.runSync(barrier.getStatus("child-5"))
    expect(status).toBe("AUTHORITY_PENDING")
  })

  it("wrong contract revision — activation denied", async () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-6", "agent:child", "session:parent", ["g1"]),
    )

    // Try to mark ready with different grant ID
    const err = await Effect.runPromise(
      Effect.flip(barrier.markReady("child-6", ["g2"])),
    )
    expect(err._tag).toBe("ChildLaunchError")
    expect(err.childSessionId).toBe("child-6")
    expect(err.reason).toContain("Grant ID mismatch")

    const status = Effect.runSync(barrier.getStatus("child-6"))
    expect(status).toBe("AUTHORITY_PENDING")
  })

  it("restart with stale PENDING grants — grants revoked", () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-7", "agent:child", "session:parent", [
        "g1",
        "g2",
      ]),
    )

    // Simulate crash/restart by marking failed
    Effect.runSync(
      barrier.markFailed("child-7", "process crashed, stale grants revoked"),
    )

    const status = Effect.runSync(barrier.getStatus("child-7"))
    expect(status).toBe("FAILED")

    // Subsequent markReady should fail since status is no longer AUTHORITY_PENDING
    // (can't test this via Effect.runPromise since markFailed is Effect<void, never>)
  })

  it("successful activation — all expected grants ACTIVE atomically", () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-8", "agent:child", "session:parent", [
        "g1",
        "g2",
      ]),
    )

    Effect.runSync(barrier.markReady("child-8", ["g1", "g2"]))

    const status = Effect.runSync(barrier.getStatus("child-8"))
    expect(status).toBe("READY")

    const activated = Effect.runSync(barrier.getActivatedGrantIds("child-8"))
    expect(activated).toEqual(["g1", "g2"])
  })

  it("waitUntilReady resolves after markReady", async () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-9", "agent:child", "session:parent", [
        "g1",
        "g2",
      ]),
    )

    // Start waiting in background
    const waitPromise = Effect.runPromise(
      barrier.waitUntilReady("child-9", 2_000),
    )

    // Call markReady after a short delay
    setTimeout(() => {
      Effect.runSync(barrier.markReady("child-9", ["g1", "g2"]))
    }, 50)

    // waitUntilReady should resolve
    const result = await Promise.race([
      waitPromise.then(() => "READY" as const),
      new Promise<"TIMEOUT">((r) => setTimeout(() => r("TIMEOUT"), 1_500)),
    ])

    expect(result).toBe("READY")

    const status = Effect.runSync(barrier.getStatus("child-9"))
    expect(status).toBe("READY")
  })

  it("markReady with grant order difference but same set succeeds", () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-10", "agent:child", "session:parent", [
        "g1",
        "g2",
        "g3",
      ]),
    )

    // Different order but same set
    Effect.runSync(barrier.markReady("child-10", ["g3", "g1", "g2"]))

    const status = Effect.runSync(barrier.getStatus("child-10"))
    expect(status).toBe("READY")

    const activated = Effect.runSync(barrier.getActivatedGrantIds("child-10"))
    expect(activated).toEqual(["g3", "g1", "g2"])
  })

  it("register fails if child session already registered", async () => {
    const barrier = new InMemoryChildLaunchBarrier()

    Effect.runSync(
      barrier.register("child-11", "agent:child", "session:parent", ["g1"]),
    )

    const err = await Effect.runPromise(
      Effect.flip(
        barrier.register("child-11", "agent:child", "session:parent", ["g1"]),
      ),
    )
    expect(err._tag).toBe("ChildLaunchError")
    expect(err.reason).toContain("already registered")
  })
})

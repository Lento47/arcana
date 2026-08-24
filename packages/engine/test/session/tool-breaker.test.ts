import { describe, expect, test } from "bun:test"
import { recordToolFailure, resetToolBreaker } from "../../src/session/tool-breaker"

/**
 * Circuit breaker: >=3 DISTINCT tools failing with the SAME signature inside
 * the window trips; this is the runtime self-heal that would have caught the
 * 2026-08-23 incident where six tools died identically on a poisoned boot
 * (ReferenceError: normalizeInfluenceClaims) while the daemon kept running.
 */

const err = (msg: string) => new ReferenceError(msg)

describe("tool breaker", () => {
  test("three distinct tools sharing one signature trip", () => {
    resetToolBreaker()
    const now = 1_000_000
    expect(recordToolFailure("grep", err("ReferenceError: normalizeInfluenceClaims is not defined"), now).trip).toBe(false)
    expect(recordToolFailure("glob", err("ReferenceError: normalizeInfluenceClaims is not defined"), now + 10).trip).toBe(false)
    const third = recordToolFailure("read", err("ReferenceError: normalizeInfluenceClaims is not defined"), now + 20)
    expect(third.trip).toBe(true)
    expect(third.distinctTools).toBe(3)
    expect(third.signature).toContain("normalizeInfluenceClaims is not defined")
  })

  test("one flaky tool repeating does not trip", () => {
    resetToolBreaker()
    const now = 2_000_000
    for (let i = 0; i < 6; i++) {
      expect(recordToolFailure("bash", new Error("exit code 1"), now + i).trip).toBe(false)
    }
  })

  test("different signatures on different tools do not trip", () => {
    resetToolBreaker()
    const now = 3_000_000
    expect(recordToolFailure("read", new Error("ENOENT"), now).trip).toBe(false)
    expect(recordToolFailure("grep", new Error("timeout"), now + 1).trip).toBe(false)
    expect(recordToolFailure("webfetch", new Error("404"), now + 2).trip).toBe(false)
  })

  test("window expiry resets the count", () => {
    resetToolBreaker()
    const t0 = 5_000_000
    expect(recordToolFailure("read", err("same sig"), t0).trip).toBe(false)
    expect(recordToolFailure("grep", err("same sig"), t0 + 30_000).trip).toBe(false)
    // First signature expired (>60s), so this is only the SECOND live failure.
    const third = recordToolFailure("glob", err("same sig"), t0 + 61_001)
    expect(third.trip).toBe(false)
    const fourth = recordToolFailure("memory_search", err("same sig"), t0 + 61_002)
    expect(fourth.trip).toBe(true)
  })
})

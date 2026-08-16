import { describe, expect, test } from "bun:test"
import { isRetryablePromptError, isSessionWorking, releaseStaleSessions } from "../src/context/prompt-queue"

describe("prompt queue retry policy", () => {
  test("retries transient server/network failures", () => {
    expect(isRetryablePromptError(new Error("Unexpected server error. Check server logs for details."))).toBeTrue()
    expect(isRetryablePromptError(new Error("fetch failed"))).toBeTrue()
    expect(isRetryablePromptError(new Error("Unable to connect"))).toBeTrue()
    expect(isRetryablePromptError({ retryable: true })).toBeTrue()
    expect(isRetryablePromptError({ data: { retryable: true } })).toBeTrue()
  })

  test("does not auto-retry validation or quota failures", () => {
    expect(isRetryablePromptError(new Error("Invalid request"))).toBeFalse()
    expect(isRetryablePromptError(new Error("No credits remaining"))).toBeFalse()
    expect(isRetryablePromptError(new Error("Model not found"))).toBeFalse()
  })

  test("treats only a live turn as working", () => {
    expect(isSessionWorking({ type: "busy" })).toBeTrue()
    expect(isSessionWorking({ type: "retry" })).toBeTrue()
    expect(isSessionWorking({ type: "idle" })).toBeFalse()
    expect(isSessionWorking({ type: "error" })).toBeFalse()
    expect(isSessionWorking(undefined)).toBeFalse()
  })

  test("releases sessions whose last active timestamp went stale", () => {
    const now = 10_000
    const activeSince = new Map<string, number>([
      ["ses-stale", now - 6_000],
      ["ses-just-sent", now - 1_000],
      ["ses-fresh", now],
    ])
    expect(releaseStaleSessions(activeSince, 5_000, now)).toEqual(["ses-stale"])
  })

  test("keeps a session that is still inside the grace window", () => {
    const now = 10_000
    const activeSince = new Map<string, number>([["ses-ramping", now - 4_999]])
    expect(releaseStaleSessions(activeSince, 5_000, now)).toEqual([])
  })
})

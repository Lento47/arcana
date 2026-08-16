import { describe, expect, test } from "bun:test"
import { isRetryablePromptError } from "../src/context/prompt-queue"

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
})

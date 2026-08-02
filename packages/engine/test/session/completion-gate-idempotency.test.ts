import { describe, expect, test } from "bun:test"
import { contractCompletionAlreadyResolved } from "../../src/session/prompt"

describe("completion gate per-contract idempotency", () => {
  test("true when the same contract already has completion.resolved", () => {
    const events = [
      { payload: { contractId: "c-1", method: "VERIFIED_COMPLETE" } },
      { payload: { method: "NO_ACTIVE_CONTRACT" } },
    ]
    expect(contractCompletionAlreadyResolved(events, "c-1")).toBe(true)
  })

  test("false when only an OLDER contract was resolved (gate must run again)", () => {
    const events = [{ payload: { contractId: "c-1", method: "VERIFIED_COMPLETE" } }]
    expect(contractCompletionAlreadyResolved(events, "c-2")).toBe(false)
  })

  test("false for empty or payload-less events", () => {
    expect(contractCompletionAlreadyResolved([], "c-1")).toBe(false)
    expect(contractCompletionAlreadyResolved([{ payload: undefined }], "c-1")).toBe(false)
  })
})

import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { MessageError } from "../../src/session/message-error"

describe("util.error", () => {
  test("schema-backed tagged errors are Schema.TaggedErrorClass instances", () => {
    const error = new MessageError.AuthError({ providerID: "anthropic", message: "boom" })

    expect(error._tag).toBe("ProviderAuthError")
    expect(error.providerID).toBe("anthropic")
    expect(error.message).toBe("boom")
    // Schema.TaggedErrorClass serializes via toJSON, not toObject
    expect(error.toJSON()).toEqual({ _tag: "ProviderAuthError", providerID: "anthropic", message: "boom" })
  })

  test("tagged errors without fields serialize with _tag only", () => {
    const error = new MessageError.OutputLengthError({})
    expect(error._tag).toBe("MessageOutputLengthError")
    expect(error.toJSON()).toEqual({ _tag: "MessageOutputLengthError" })
  })
})

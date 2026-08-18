import { describe, expect, it } from "bun:test"
import { ApprovalRequiredError, ArcanaError, AuthorizationDeniedError, toArcanaError } from "./errors.js"

describe("SDK error model (E3)", () => {
  it("maps HTTP statuses onto stable codes", () => {
    expect(toArcanaError(403, { reason: "denied" })).toMatchObject({
      code: "AUTHORIZATION_DENIED",
      status: 403,
    })
    expect(toArcanaError(402, "approval")).toBeInstanceOf(ApprovalRequiredError)
    expect(toArcanaError(500, "boom")).toMatchObject({ code: "TRANSPORT_ERROR" })
  })

  it("preserves details and instanceof semantics", () => {
    const err = new AuthorizationDeniedError("nope", { requestHash: "h" })
    expect(err).toBeInstanceOf(ArcanaError)
    expect(err.code).toBe("AUTHORIZATION_DENIED")
    expect(err.details).toEqual({ requestHash: "h" })
    expect(err.status).toBe(403)
  })
})

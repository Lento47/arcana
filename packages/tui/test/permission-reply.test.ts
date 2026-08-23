import { describe, expect, test } from "bun:test"
import { isPermissionNotFoundError } from "../src/routes/session/permission"

describe("isPermissionNotFoundError (gate-freeze fix A)", () => {
  test("detects resolved-error payloads carrying requestID", () => {
    expect(isPermissionNotFoundError({ requestID: "per_123", message: "not found" })).toBe(true)
  })

  test("detects thrown HttpApi errors with 404 status", () => {
    expect(isPermissionNotFoundError({ status: 404, body: "nope" })).toBe(true)
    expect(isPermissionNotFoundError({ status: "404" })).toBe(true)
  })

  test("rejects unrelated failures and non-objects", () => {
    expect(isPermissionNotFoundError({ status: 500 })).toBe(false)
    expect(isPermissionNotFoundError({ message: "network down" })).toBe(false)
    expect(isPermissionNotFoundError(undefined)).toBe(false)
    expect(isPermissionNotFoundError(null)).toBe(false)
    expect(isPermissionNotFoundError("boom")).toBe(false)
  })
})

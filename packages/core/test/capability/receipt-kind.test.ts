import { describe, expect, test } from "bun:test"
import { receiptKindForRequest } from "../../src/capability/pep"

describe("receiptKindForRequest (criteria receipts)", () => {
  test("cargo test → test_receipt", () => {
    expect(receiptKindForRequest({ executable: "cargo", arguments: ["test", "--workspace"] })).toBe("test_receipt")
  })

  test("cargo check → test_receipt", () => {
    expect(receiptKindForRequest({ executable: "cargo", arguments: ["check"] })).toBe("test_receipt")
  })

  test("bun run build → build_receipt", () => {
    expect(receiptKindForRequest({ executable: "bun", arguments: ["run", "build"] })).toBe("build_receipt")
  })

  test("npm test → test_receipt", () => {
    expect(receiptKindForRequest({ executable: "npm", arguments: ["test"] })).toBe("test_receipt")
  })

  test("go test → test_receipt", () => {
    expect(receiptKindForRequest({ executable: "go", arguments: ["test", "./..."] })).toBe("test_receipt")
  })

  test("Test-Path is not a test runner", () => {
    expect(receiptKindForRequest({ executable: "Test-Path", arguments: ["-LiteralPath", "L:\\tmp"] })).toBeUndefined()
  })

  test("goal_check (no executable) is not a test runner", () => {
    expect(receiptKindForRequest({})).toBeUndefined()
  })

  test("pwd is not a test runner", () => {
    expect(receiptKindForRequest({ executable: "pwd" })).toBeUndefined()
  })
})

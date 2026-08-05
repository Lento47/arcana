import { describe, expect, it } from "bun:test"
import { Schema } from "effect"
import { ApprovalStateSchema } from "../../src/approval/events"

const DURABLE_STATES = [
  "PENDING",
  "APPROVED",
  "DENIED",
  "CLAIMED",
  "CONSUMED",
  "EXPIRED",
  "INVALIDATED",
] as const

function literals(schema: Schema.Schema<unknown>): readonly string[] {
  const ast = schema.ast as any
  if (ast._tag === "Union") {
    return ast.types.map((t: any) => (t._tag === "Literal" ? String(t.literal) : "")).filter(Boolean)
  }
  if (ast._tag === "Literal") return [String(ast.literal)]
  return []
}

describe("ApprovalStateSchema durable vocabulary", () => {
  it("exposes exactly the seven durable states", () => {
    const actual = literals(ApprovalStateSchema).slice().sort()
    const expected = [...DURABLE_STATES].slice().sort()
    expect(actual).toEqual(expected)
  })

  it("does not include REJECTED or RECOVERY_REQUIRED", () => {
    const actual = literals(ApprovalStateSchema)
    expect(actual).not.toContain("REJECTED")
    expect(actual).not.toContain("RECOVERY_REQUIRED")
  })

  it("accepts every durable state", () => {
    for (const state of DURABLE_STATES) {
      expect(() => Schema.decodeUnknownSync(ApprovalStateSchema)(state)).not.toThrow()
    }
  })

  it("rejects REJECTED and RECOVERY_REQUIRED", () => {
    expect(() => Schema.decodeUnknownSync(ApprovalStateSchema)("REJECTED")).toThrow()
    expect(() => Schema.decodeUnknownSync(ApprovalStateSchema)("RECOVERY_REQUIRED")).toThrow()
  })
})

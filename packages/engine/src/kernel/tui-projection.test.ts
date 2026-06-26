import { describe, expect, test } from "bun:test"
import { createEngineAction } from "./action"
import { createMutationProposal } from "./mutation"
import { createKernelProjection, projectionIsProofBacked, projectionRollbackReady, riskBandForProjection } from "./tui-projection"

describe("Arcana TUI projection", () => {
  test("low-risk projections render calm", () => {
    const action = createEngineAction({
      id: "act_read",
      source: "builder",
      kind: "file_read",
      name: "read",
      input_summary: "read src/index.ts",
      security: { paths: ["src/index.ts"] },
    })

    expect(riskBandForProjection({ actions: [action], mutations: [] })).toBe("calm")
  })

  test("critical action blocks projection", () => {
    const action = createEngineAction({
      id: "act_secret",
      source: "builder",
      kind: "file_read",
      name: "read",
      input_summary: "read secret",
      security: { paths: [".env"] },
    })

    expect(riskBandForProjection({ actions: [action], mutations: [] })).toBe("blocked")
  })

  test("projection computes rollback readiness from mutation evidence", () => {
    const mutation = createMutationProposal({
      source: "agent",
      state: "approved",
      intent: "modify file",
      risk: "medium",
      files: [{ path: "src/index.ts", operation: "modify" }],
    })

    expect(projectionRollbackReady([mutation])).toBe(false)
    expect(projectionRollbackReady([{ ...mutation, evidence: { checkpoint_id: "chk_1" } }])).toBe(true)
  })

  test("projection is proof-backed when actions carry RunProof evidence", () => {
    const action = createEngineAction({
      id: "act_read",
      source: "builder",
      kind: "file_read",
      name: "read",
      input_summary: "read src/index.ts",
      security: { paths: ["src/index.ts"] },
    })
    const projection = createKernelProjection({
      run_id: "run_1",
      objective: "inspect file",
      actions: [action],
      mutations: [],
      proof_completeness: 0.8,
      compatibility_active: 0,
    })

    expect(projection.risk_band).toBe("calm")
    expect(projection.rollback_ready).toBe(true)
    expect(projectionIsProofBacked(projection)).toBe(true)
  })
})

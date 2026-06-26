import { describe, expect, test } from "bun:test"
import { createRunProofEvent, createRunProofProjection, runProofCompleteness, runProofGaps, runProofIsComplete } from "./runproof-projection"

describe("Arcana RunProof projection", () => {
  test("detects missing core evidence", () => {
    const projection = createRunProofProjection({
      run_id: "run_1",
      objective: "fix bug",
      events: [createRunProofEvent({ kind: "action", summary: "action recorded" })],
    })

    expect(projection.gaps).toContain("missing pipeline evidence")
    expect(projection.gaps).toContain("missing security evidence")
    expect(projection.gaps).toContain("missing verifier evidence")
    expect(runProofIsComplete(projection)).toBe(false)
  })

  test("mutation evidence requires rollback evidence", () => {
    const gaps = runProofGaps([
      createRunProofEvent({ kind: "pipeline", summary: "pipeline" }),
      createRunProofEvent({ kind: "action", summary: "action" }),
      createRunProofEvent({ kind: "security", summary: "security" }),
      createRunProofEvent({ kind: "verification", summary: "verification" }),
      createRunProofEvent({ kind: "mutation", summary: "mutation" }),
    ])

    expect(gaps).toContain("mutation has no rollback evidence")
  })

  test("complete projection has no gaps", () => {
    const events = [
      createRunProofEvent({ kind: "pipeline", summary: "pipeline" }),
      createRunProofEvent({ kind: "action", summary: "action" }),
      createRunProofEvent({ kind: "security", summary: "security" }),
      createRunProofEvent({ kind: "candidate_set", summary: "candidate set" }),
      createRunProofEvent({ kind: "mutation", summary: "mutation" }),
      createRunProofEvent({ kind: "rollback", summary: "rollback" }),
      createRunProofEvent({ kind: "verification", summary: "verification" }),
    ]
    const projection = createRunProofProjection({ run_id: "run_2", objective: "ship safe change", events })

    expect(projection.gaps).toEqual([])
    expect(projection.completeness).toBe(1)
    expect(runProofIsComplete(projection)).toBe(true)
  })

  test("completeness decreases with gaps", () => {
    expect(runProofCompleteness([], [])).toBe(0)
    expect(runProofCompleteness([createRunProofEvent({ kind: "action", summary: "action" })], ["gap"])).toBeLessThan(1)
  })
})

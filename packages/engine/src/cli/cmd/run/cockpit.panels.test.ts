import { describe, expect, test } from "bun:test"
import { createCandidateSet, createEngineAction, createMutationProposal, createPipelinePlan, createRunProofEvent, createRunProofProjection } from "@/kernel"
import { createEmptyCockpitProjection, reduceCockpitProjection } from "./cockpit.projection-store"
import { actionTimelineView, candidateBoardView, cockpitPanelViews, cockpitPanelsCoverSteps29To40, diffGateQueueView, missionHeaderView, proofLedgerView } from "./cockpit.panels"

const score = {
  correctness: 0.9,
  security: 0.9,
  maintainability: 0.8,
  performance: 0.7,
  verification_depth: 0.8,
  rollback_safety: 0.7,
  minimality: 0.6,
}

describe("Arcana cockpit panel view models", () => {
  test("covers steps 29 through 40", () => {
    const projection = createEmptyCockpitProjection({ run_id: "run_1", objective: "ship cockpit" })
    const views = cockpitPanelViews(projection)

    expect(cockpitPanelsCoverSteps29To40(views)).toBe(true)
    expect(views.map((view) => view.id)).toEqual([
      "mission-header",
      "pipeline-board",
      "action-timeline",
      "action-detail-drawer",
      "risk-cockpit",
      "permission-risk-card",
      "diffgate-queue",
      "mutation-detail-drawer",
      "candidate-board",
      "candidate-compare-drawer",
      "verifier-board",
      "proof-ledger",
    ])
  })

  test("mission and pipeline panels read projection state", () => {
    const plan = createPipelinePlan({ id: "pipe_1", pipeline: "migration", objective: "native cockpit", risk: "medium" })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "pipeline", plan })

    expect(missionHeaderView(projection).summary).toBe("native cockpit")
    expect(cockpitPanelViews(projection)[1]?.metric).toContain("migration")
  })

  test("action and mutation panels expose runtime rows", () => {
    const action = createEngineAction({ id: "act_1", source: "builder", kind: "file_write", name: "write", input_summary: "write file" })
    const mutation = createMutationProposal({ source: "agent", intent: "write file", risk: "medium", files: [{ path: "src/index.ts", operation: "modify" }] })
    const withAction = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "action", action })
    const projection = reduceCockpitProjection(withAction, { type: "mutation", mutation })

    expect(actionTimelineView(projection).rows[0]).toContain("act_1")
    expect(diffGateQueueView(projection).metric).toBe("1 mutations")
  })

  test("candidate board can render candidate sets", () => {
    const set = createCandidateSet({
      id: "cset_1",
      objective: "choose patch",
      risk: "medium",
      candidates: [{ id: "cand_1", status: "selected", summary: "patch", risk: "medium", score, evidence: ["test"] }],
      selected_candidate_id: "cand_1",
      selection_policy: "human_selected",
    })
    const view = candidateBoardView(createEmptyCockpitProjection({ run_id: "run_1" }), [set])

    expect(view.metric).toBe("1 candidates")
    expect(view.rows[0]).toContain("cand_1")
  })

  test("proof ledger exposes gaps and events", () => {
    const proof = createRunProofProjection({
      run_id: "run_1",
      objective: "ship cockpit",
      events: [
        createRunProofEvent({ kind: "pipeline", summary: "pipeline" }),
        createRunProofEvent({ kind: "action", summary: "action" }),
      ],
    })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "proof", proof })

    expect(proofLedgerView(projection).metric).toContain("gaps")
    expect(proofLedgerView(projection).rows.length).toBeGreaterThan(0)
  })
})

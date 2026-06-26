import { describe, expect, test } from "bun:test"
import {
  createEngineAction,
  createMutationProposal,
  createRunProofEvent,
  createRunProofProjection,
  createVerificationRun,
  createVerifierRecord,
} from "@/kernel"
import { createEmptyCockpitProjection, reduceCockpitProjection } from "./cockpit.projection-store"
import {
  cockpitBlockedAction,
  cockpitGovernanceActions,
  cockpitGovernanceCoversSteps43To50,
  limitationAcceptAction,
  mutationDiffAction,
  mutationGovernanceActions,
  permissionGovernanceActions,
  rollbackStageAction,
  runProofExportAction,
  verifierRerunAction,
} from "./cockpit.governance-actions"

describe("Arcana cockpit governance actions", () => {
  test("covers governance steps 43 through 50", () => {
    const actions = cockpitGovernanceActions(createEmptyCockpitProjection({ run_id: "run_1" }))

    expect(cockpitGovernanceCoversSteps43To50(actions)).toBe(true)
  })

  test("enables permission actions for permission-required engine actions", () => {
    const action = createEngineAction({
      id: "act_shell",
      source: "builder",
      kind: "shell",
      name: "shell",
      input_summary: "run command",
    })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "action", action })
    const actions = permissionGovernanceActions(projection)

    expect(actions.map((item) => item.step)).toEqual([43, 43])
    expect(actions.every((item) => item.enabled)).toBe(true)
    expect(actions[0]?.target_id).toBe("act_shell")
  })

  test("enables mutation decision actions for proposed mutation", () => {
    const mutation = createMutationProposal({
      source: "agent",
      intent: "change file",
      risk: "medium",
      files: [{ path: "src/index.ts", operation: "modify" }],
    })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "mutation", mutation })
    const actions = mutationGovernanceActions(projection)

    expect(actions.map((item) => item.step)).toEqual([44, 44])
    expect(actions.every((item) => item.enabled)).toBe(true)
  })

  test("opens mutation diff when file changes exist", () => {
    const mutation = createMutationProposal({
      source: "agent",
      intent: "change file",
      risk: "low",
      files: [{ path: "src/index.ts", operation: "modify" }],
    })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "mutation", mutation })
    const action = mutationDiffAction(projection)

    expect(action.step).toBe(45)
    expect(action.enabled).toBe(true)
    expect(action.target_id).toBe(mutation.id)
  })

  test("stages rollback only when checkpoint evidence exists", () => {
    const mutation = createMutationProposal({
      source: "agent",
      state: "applied",
      intent: "change file",
      risk: "medium",
      files: [{ path: "src/index.ts", operation: "modify" }],
      evidence: { checkpoint_id: "checkpoint_1" },
    })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "mutation", mutation })
    const action = rollbackStageAction(projection)

    expect(action.step).toBe(46)
    expect(action.enabled).toBe(true)
  })

  test("exposes verifier rerun and limitation acceptance", () => {
    const run = createVerificationRun("mut_1", ["test_output"])
    const verifier = createVerifierRecord(run, [{ check: "manual", description: "manual note", severity: "warning" }])
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "verifier", verifier })

    expect(verifierRerunAction(projection).step).toBe(47)
    expect(verifierRerunAction(projection).enabled).toBe(true)
    expect(limitationAcceptAction(projection).step).toBe(48)
    expect(limitationAcceptAction(projection).enabled).toBe(true)
  })

  test("exports RunProof receipt when proof events exist", () => {
    const proof = createRunProofProjection({
      run_id: "run_1",
      objective: "ship cockpit",
      events: [createRunProofEvent({ kind: "pipeline", summary: "pipeline" })],
    })
    const projection = reduceCockpitProjection(createEmptyCockpitProjection({ run_id: "run_1" }), { type: "proof", proof })
    const action = runProofExportAction(projection)

    expect(action.step).toBe(49)
    expect(action.enabled).toBe(true)
  })

  test("shows blocked explanation when proof is incomplete", () => {
    const action = cockpitBlockedAction(createEmptyCockpitProjection({ run_id: "run_1" }))

    expect(action.step).toBe(50)
    expect(action.enabled).toBe(true)
  })
})

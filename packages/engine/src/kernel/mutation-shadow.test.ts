import { describe, expect, test } from "bun:test"
import { createEngineAction } from "./action"
import { mutationProposalFromAction, shadowMutationCoverage } from "./mutation-shadow"

describe("Arcana mutation shadow adapter", () => {
  test("creates mutation proposal for file write action", () => {
    const action = createEngineAction({
      id: "act_write",
      source: "builder",
      kind: "file_write",
      name: "write",
      input_summary: "modify src/index.ts",
      security: { paths: ["src/index.ts"] },
    })
    const proposal = mutationProposalFromAction(action)

    expect(proposal).toBeDefined()
    expect(proposal?.evidence.action_id).toBe("act_write")
    expect(proposal?.risk).toBe(action.risk)
  })

  test("does not create proposal for read-only action", () => {
    const action = createEngineAction({
      id: "act_read",
      source: "builder",
      kind: "file_read",
      name: "read",
      input_summary: "read src/index.ts",
      security: { paths: ["src/index.ts"] },
    })

    expect(mutationProposalFromAction(action)).toBeUndefined()
  })

  test("reports shadow coverage for required mutation actions", () => {
    const write = createEngineAction({
      id: "act_write",
      source: "builder",
      kind: "file_write",
      name: "write",
      input_summary: "modify file",
      security: { paths: ["src/index.ts"] },
    })
    const read = createEngineAction({
      id: "act_read",
      source: "builder",
      kind: "file_read",
      name: "read",
      input_summary: "read file",
      security: { paths: ["src/index.ts"] },
    })
    const proposal = mutationProposalFromAction(write)!

    expect(shadowMutationCoverage([write, read], [proposal])).toEqual({ required: 1, proposed: 1, complete: true })
    expect(shadowMutationCoverage([write, read], [])).toEqual({ required: 1, proposed: 0, complete: false })
  })
})

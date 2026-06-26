import { describe, expect, test } from "bun:test"
import {
  actionCanRunWithoutVerifier,
  actionRequiresMutationGate,
  actionRequiresPermission,
  createEngineAction,
  decidePolicyForAction,
} from "./action"
import { deriveSecurityContext } from "./security-context"

describe("Arcana engine action authority", () => {
  test("creates a low-risk file read action", () => {
    const action = createEngineAction({
      id: "act_read",
      source: "builder",
      kind: "file_read",
      name: "read",
      input_summary: "read src/index.ts",
      security: { paths: ["src/index.ts"] },
    })

    expect(action.id).toBe("act_read")
    expect(action.risk).toBe("low")
    expect(action.policy).toBe("allow")
    expect(action.reversible).toBe(true)
    expect(actionRequiresPermission(action)).toBe(false)
    expect(actionRequiresMutationGate(action)).toBe(false)
  })

  test("file write actions require mutation evidence and diff-style policy", () => {
    const action = createEngineAction({
      id: "act_write",
      source: "builder",
      kind: "file_write",
      name: "write",
      input_summary: "modify src/index.ts",
      security: { paths: ["src/index.ts"] },
    })

    expect(action.required_controls).toContain("checkpoint")
    expect(action.required_controls).toContain("rollback")
    expect(action.policy).toBe("propose_diff")
    expect(action.evidence).toContainEqual({ kind: "mutation_record", required: true })
    expect(actionRequiresMutationGate(action)).toBe(true)
  })

  test("secret access becomes ask policy and cannot be silent", () => {
    const action = createEngineAction({
      source: "builder",
      kind: "file_read",
      name: "read",
      input_summary: "read .env",
      security: { paths: [".env"] },
    })

    expect(action.risk).toBe("critical")
    expect(action.policy).toBe("ask")
    expect(action.required_controls).toContain("approval")
    expect(action.required_controls).toContain("redaction")
    expect(actionRequiresPermission(action)).toBe(true)
  })

  test("dependency mutation requires verifier policy", () => {
    const action = createEngineAction({
      source: "builder",
      kind: "file_write",
      name: "write",
      input_summary: "modify package.json",
      security: { paths: ["package.json"] },
    })

    expect(action.risk).toBe("medium")
    expect(action.required_controls).toContain("verifier")
    expect(action.policy).toBe("require_verifier")
    expect(actionCanRunWithoutVerifier(action)).toBe(false)
  })

  test("network egress requires permission and is not reversible", () => {
    const action = createEngineAction({
      source: "builder",
      kind: "network",
      name: "fetch",
      input_summary: "call external API",
      security: { network_egress: true },
    })

    expect(action.policy).toBe("ask")
    expect(action.reversible).toBe(false)
    expect(actionRequiresPermission(action)).toBe(true)
  })

  test("policy decision follows security context controls", () => {
    expect(decidePolicyForAction(deriveSecurityContext({ action_kind: "file_read", paths: ["src/index.ts"] }))).toBe("allow")
    expect(decidePolicyForAction(deriveSecurityContext({ action_kind: "shell", command: "echo ok" }))).toBe("sandbox")
    expect(decidePolicyForAction(deriveSecurityContext({ action_kind: "file_read", paths: [".env"] }))).toBe("ask")
  })
})

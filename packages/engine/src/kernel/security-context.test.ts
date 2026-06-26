import { describe, expect, test } from "bun:test"
import {
  deriveSecurityContext,
  securityContextBlocksAutoApply,
  securityContextRequiresHumanReview,
} from "./security-context"

describe("Arcana security context authority", () => {
  test("classifies secret paths as critical and approval gated", () => {
    const context = deriveSecurityContext({ action_kind: "file_read", paths: [".env"] })

    expect(context.assets).toContain("secret")
    expect(context.assets).toContain("credential")
    expect(context.dangerous_capabilities).toContain("read_secret")
    expect(context.required_controls).toContain("approval")
    expect(context.required_controls).toContain("redaction")
    expect(context.required_controls).toContain("human_review")
    expect(context.risk).toBe("critical")
    expect(securityContextRequiresHumanReview(context)).toBe(true)
    expect(securityContextBlocksAutoApply(context)).toBe(true)
  })

  test("dependency changes require SBOM, OSV, and verifier controls", () => {
    const context = deriveSecurityContext({ action_kind: "file_write", paths: ["package.json", "pnpm-lock.yaml"] })

    expect(context.assets).toContain("dependency_manifest")
    expect(context.assets).toContain("lockfile")
    expect(context.dangerous_capabilities).toContain("modify_dependency")
    expect(context.required_controls).toContain("sbom_scan")
    expect(context.required_controls).toContain("osv_scan")
    expect(context.required_controls).toContain("verifier")
    expect(context.required_controls).toContain("checkpoint")
    expect(context.required_controls).toContain("rollback")
    expect(context.risk).toBe("medium")
  })

  test("auth and billing surfaces require human review", () => {
    const context = deriveSecurityContext({ action_kind: "file_write", paths: ["src/auth/session.ts", "src/billing/checkout.ts"] })

    expect(context.assets).toContain("auth")
    expect(context.assets).toContain("billing")
    expect(context.required_controls).toContain("human_review")
    expect(context.required_controls).toContain("verifier")
    expect(context.risk).toBe("critical")
  })

  test("destructive shell commands require checkpoint, approval, rollback, and review", () => {
    const context = deriveSecurityContext({ action_kind: "shell", command: "rm -rf dist" })

    expect(context.trust_boundaries).toContain("shell")
    expect(context.dangerous_capabilities).toContain("execute_shell")
    expect(context.dangerous_capabilities).toContain("delete_file")
    expect(context.required_controls).toContain("approval")
    expect(context.required_controls).toContain("checkpoint")
    expect(context.required_controls).toContain("rollback")
    expect(context.required_controls).toContain("human_review")
    expect(context.risk).toBe("critical")
  })

  test("provider actions expose model route sovereignty", () => {
    const context = deriveSecurityContext({ action_kind: "provider", model_provider: "local-ollama" })

    expect(context.assets).toContain("model_route")
    expect(context.trust_boundaries).toContain("model_provider")
    expect(context.reasons.join(" ")).toContain("AI sovereignty")
  })

  test("low-risk file reads remain lightweight", () => {
    const context = deriveSecurityContext({ action_kind: "file_read", paths: ["src/index.ts"] })

    expect(context.risk).toBe("low")
    expect(context.required_controls).toEqual([])
    expect(securityContextBlocksAutoApply(context)).toBe(false)
  })
})

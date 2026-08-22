import { describe, expect, test } from "bun:test"
import { AgentRunner, runProofVerificationKindFromShellCommand } from "./runner.js"

describe("AgentRunner RunProof verification shell classification", () => {
  test("classifies focused verification commands", () => {
    expect(runProofVerificationKindFromShellCommand("bun test packages/arcana/src/proof/proof-manager.test.ts")).toBe("test")
    expect(runProofVerificationKindFromShellCommand("bun run typecheck")).toBe("typecheck")
    expect(runProofVerificationKindFromShellCommand("pnpm lint")).toBe("lint")
    expect(runProofVerificationKindFromShellCommand("npm run build")).toBe("build")
    expect(runProofVerificationKindFromShellCommand("vite build")).toBe("build")
  })

  test("ignores non-verification shell commands", () => {
    expect(runProofVerificationKindFromShellCommand("rg -n proof packages/arcana/src")).toBeUndefined()
    expect(runProofVerificationKindFromShellCommand("git status --short")).toBeUndefined()
    expect(runProofVerificationKindFromShellCommand("echo building context summary")).toBeUndefined()
  })
})

describe("AgentRunner independent goal verifier", () => {
  test("rejects completion without objective-scoped execution receipts", async () => {
    const runner = new AgentRunner({})
    const verdict = await runner.verifyGoalCompletion({
      goal: "change the project",
      pending: "none",
      blocked: "none",
    })
    expect(verdict.verdict).toBe("rejected")
    expect(verdict.summary).toContain("No execution receipts")
  })

  test("rejects reported pending work before calling a model", async () => {
    const runner = new AgentRunner({})
    const verdict = await runner.verifyGoalCompletion({
      goal: "change the project",
      pending: "run the tests",
      blocked: "none",
    })
    expect(verdict.verdict).toBe("rejected")
    expect(verdict.unmetCriteria[0]).toContain("run the tests")
  })
})

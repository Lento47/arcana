import { describe, expect, test } from "bun:test"
import { assessActionRisk } from "./risk"

describe("assessActionRisk", () => {
  test("classifies read-only file access as low risk", () => {
    const risk = assessActionRisk({ kind: "file_read", name: "read", input: { path: "src/index.ts" } })

    expect(risk.level).toBe("low")
    expect(risk.required_controls).toEqual([])
  })

  test("classifies secret reads as high risk", () => {
    const risk = assessActionRisk({ kind: "file_read", name: "read", input: { path: ".env" } })

    expect(risk.level).toBe("high")
    expect(risk.required_controls).toContain("approval")
    expect(risk.required_controls).toContain("human_review")
  })

  test("infers write tools as file_write and requires diff gate", () => {
    const risk = assessActionRisk({ kind: "tool", name: "edit", input: { file: "src/auth.ts" } })

    expect(risk.level).toBe("medium")
    expect(risk.required_controls).toContain("diff")
    expect(risk.required_controls).toContain("checkpoint")
  })

  test("classifies destructive shell commands as critical", () => {
    const risk = assessActionRisk({ kind: "tool", name: "bash", input: { command: "rm -rf dist" } })

    expect(risk.level).toBe("critical")
    expect(risk.required_controls).toContain("approval")
    expect(risk.required_controls).toContain("checkpoint")
    expect(risk.required_controls).toContain("sandbox")
    expect(risk.required_controls).toContain("human_review")
  })

  test("classifies package-manager shell commands as high risk", () => {
    const risk = assessActionRisk({ kind: "shell", name: "bash", input: { command: "bun add left-pad" } })

    expect(risk.level).toBe("high")
    expect(risk.required_controls).toContain("approval")
    expect(risk.required_controls).toContain("checkpoint")
    expect(risk.required_controls).toContain("verifier")
  })
})

import { expect, test } from "bun:test"
import {
  arcanaTaskInstruction,
  arcanaTaskObjective,
  arcanaTaskObjectiveLabel,
  assessArcanaTaskRisk,
  arcanaRiskForTask,
  arcanaTaskFromPart,
  parseArcanaPromptCommand,
  promptTextFromPart,
} from "../src/arcana/task"

test("parses Arcana slash task prefixes without treating unknown slash commands as Arcana", () => {
  expect(parseArcanaPromptCommand("/contract refactor auth middleware")).toEqual({
    command: "contract",
    arguments: "refactor auth middleware",
  })
  expect(parseArcanaPromptCommand("/actions inspect timeline\nthen continue")).toEqual({
    command: "actions",
    arguments: "inspect timeline\nthen continue",
  })
  expect(parseArcanaPromptCommand("/consensus compare migration strategies")).toEqual({
    command: "consensus",
    arguments: "compare migration strategies",
  })
  expect(parseArcanaPromptCommand("/unknown do work")).toBeUndefined()
  expect(parseArcanaPromptCommand("plain task")).toBeUndefined()
})

test("defines distinct objectives for Arcana slash task prefixes", () => {
  expect(arcanaTaskObjective("contract")).toContain("execution contract")
  expect(arcanaTaskObjective("actions")).toContain("action timeline")
  expect(arcanaTaskObjective("diffgate")).toContain("gated mutations")
  expect(arcanaTaskObjective("verify")).toContain("verification")
  expect(arcanaTaskObjective("sovereignty")).toContain("provider and model accountability")
  expect(arcanaTaskObjective("consensus")).toContain("multi-agent/model council")
  expect(arcanaTaskObjective("unknown")).toBeUndefined()
  expect(arcanaTaskObjectiveLabel("contract")).toBe("execution contract")
  expect(arcanaTaskObjectiveLabel("sovereignty")).toBe("model route")
  expect(arcanaTaskObjectiveLabel("consensus")).toBe("multi-agent consensus")
  expect(arcanaTaskObjectiveLabel("unknown")).toBeUndefined()
})

test("builds a compact synthetic Arcana task contract for model execution", () => {
  expect(
    arcanaTaskInstruction({
      command: "contract",
      risk: assessArcanaTaskRisk("upgrade auth dependency"),
      approval_status: "approved",
    }),
  ).toContain("Command: /contract")
  expect(
    arcanaTaskInstruction({
      command: "contract",
      risk: assessArcanaTaskRisk("upgrade auth dependency"),
      approval_status: "approved",
    }),
  ).toContain("Approval: approved")
})

test("classifies Arcana slash task risk from task text", () => {
  expect(arcanaRiskForTask("rename local variables")).toBe("medium")
  expect(arcanaRiskForTask("upgrade auth dependency lockfile")).toBe("high")
  expect(arcanaRiskForTask("run rm -rf dist before production deploy")).toBe("critical")
  expect(assessArcanaTaskRisk("upgrade auth dependency lockfile")).toEqual({
    level: "high",
    approval_required: true,
    reasons: ["Task references security, dependencies, data, deployment, billing, or credential-sensitive work."],
  })
})

test("round-trips Arcana text part metadata back into prompt text", () => {
  const part = {
    type: "text",
    text: "refactor auth middleware",
    metadata: {
      arcana: {
        command: "contract",
        risk: "high",
        approval_required: true,
        approval_status: "approved",
        risk_reasons: ["Task references security-sensitive work."],
      },
    },
  } as never

  expect(arcanaTaskFromPart(part)).toEqual({
    command: "contract",
    objective:
      "Compile the task into an execution contract first: goal, scope, allowed work, risk, approvals, artifacts, rollback, and verification.",
    objective_label: "execution contract",
    risk: "high",
    approval_required: true,
    approval_status: "approved",
    risk_reasons: ["Task references security-sensitive work."],
  })
  expect(promptTextFromPart(part)).toBe("/contract refactor auth middleware")
})

test("omits synthetic text parts from prompt restoration", () => {
  expect(promptTextFromPart({ type: "text", text: "internal note", synthetic: true } as never)).toBe("")
})

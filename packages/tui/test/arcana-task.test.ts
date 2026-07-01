import { expect, test } from "bun:test"
import {
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
  expect(parseArcanaPromptCommand("/unknown do work")).toBeUndefined()
  expect(parseArcanaPromptCommand("plain task")).toBeUndefined()
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
        risk_reasons: ["Task references security-sensitive work."],
      },
    },
  } as never

  expect(arcanaTaskFromPart(part)).toEqual({
    command: "contract",
    risk: "high",
    approval_required: true,
    risk_reasons: ["Task references security-sensitive work."],
  })
  expect(promptTextFromPart(part)).toBe("/contract refactor auth middleware")
})

test("omits synthetic text parts from prompt restoration", () => {
  expect(promptTextFromPart({ type: "text", text: "internal note", synthetic: true } as never)).toBe("")
})

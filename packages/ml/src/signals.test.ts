import { describe, expect, test } from "bun:test"
import { analyzeTool, analyzeTurn } from "./signals.js"
import { formatTurnSignalForSystemPrompt } from "./llm.js"

describe("Arcana Signal Engine", () => {
  test("routes code-fix prompts toward sandboxed code posture", () => {
    const signal = analyzeTurn({
      prompt: "fix this TypeScript repo and run the failing tests",
      sandboxEnabled: false,
    })

    expect(signal.intent).toBe("debugging")
    expect(signal.needs.sandbox).toBe(true)
    expect(signal.executionPosture).toBe("sandbox")
    expect(signal.modelRoute.profile).toBe("code")
  })

  test("honors user sovereignty approval preferences", () => {
    const signal = analyzeTurn({
      prompt: "edit the files and commit the fix",
      sandboxEnabled: true,
      userSovereignty: { requireApprovalForWrites: true },
    })

    expect(signal.needs.approval).toBe(true)
    expect(signal.executionPosture).toBe("approval")
  })

  test("scores write-capable tools higher than read-only tools", () => {
    const readSignal = analyzeTool({ toolName: "read", args: { filePath: "README.md" } })
    const writeSignal = analyzeTool({ toolName: "write", args: { filePath: "README.md", content: "x" } })

    expect(readSignal.risk).toBe("low")
    expect(writeSignal.risk).not.toBe("low")
  })

  test("formats turn signals for LLM system prompt injection", () => {
    const signal = analyzeTurn({ prompt: "review this repo for bugs" })
    const formatted = formatTurnSignalForSystemPrompt(signal)

    expect(formatted).toContain("<arcana-signal-engine>")
    expect(formatted).toContain("intent")
    expect(formatted).toContain("execution_posture")
  })
})

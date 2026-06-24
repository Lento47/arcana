import { describe, expect, test } from "bun:test"
import { analyzeTool, analyzeTurn } from "./signals.js"
import { formatTurnSignalForSystemPrompt } from "./llm.js"
import { decideToolPolicy, decideTurnPolicy } from "./policy.js"
import { rerankCandidates } from "./rerank.js"
import { parseFeedback, serializeFeedback, summarizeFeedback } from "./feedback.js"

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

  test("converts turn and tool signals into policy decisions", () => {
    const turn = analyzeTurn({
      prompt: "edit files in this repo",
      userSovereignty: { requireApprovalForWrites: true },
    })
    const tool = analyzeTool({
      toolName: "write",
      args: { filePath: "src/index.ts", content: "export {}" },
      userSovereignty: { requireApprovalForWrites: true },
    })

    expect(decideTurnPolicy(turn).action).toBe("ask_approval")
    expect(decideToolPolicy(tool).action).toBe("ask_approval")
  })

  test("reranks memory or skill candidates using local lexical signals", () => {
    const ranked = rerankCandidates({
      query: "typescript failing tests",
      candidates: [
        { id: "a", title: "Marketing copy", content: "Brand voice and landing page notes" },
        { id: "b", title: "TypeScript test debugging", content: "How to inspect failing bun tests" },
      ],
    })

    expect(ranked[0]?.id).toBe("b")
    expect(ranked[0]?.score ?? 0).toBeGreaterThan(ranked[1]?.score ?? 0)
  })

  test("serializes feedback for future supervised datasets", () => {
    const line = serializeFeedback({ signalKind: "policy", outcome: "overridden", correction: "approval was too strict", score: 0.3 })
    const parsed = parseFeedback(line)
    const summary = summarizeFeedback(parsed ? [parsed] : [])

    expect(parsed?.outcome).toBe("overridden")
    expect(summary.total).toBe(1)
    expect(summary.corrections).toBe(1)
  })
})

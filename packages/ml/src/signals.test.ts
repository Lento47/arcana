import { describe, expect, test } from "bun:test"
import { analyzeTool, analyzeTurn } from "./signals.js"
import { formatTurnSignalForSystemPrompt } from "./llm.js"
import { decideToolPolicy, decideTurnPolicy } from "./policy.js"
import { rerankCandidates } from "./rerank.js"
import { parseFeedback, serializeFeedback, summarizeFeedback } from "./feedback.js"
import { compressSemantically, estimateTokens, planTokenBudget } from "./token.js"
import { rewriteSemantics } from "./semantic.js"
import { analyzeSqlOptimization } from "./sql.js"
import { formatMachineResourcePlan, planMachineResourceUse } from "./machine.js"
import { formatExpectationContractForPrompt, inferExpectationContract } from "./expectation.js"
import { buildRevisionPrompt, evaluateResponseQuality } from "./quality.js"
import { evaluateResponsePostflight, prepareResponsePreflight } from "./response-pipeline.js"
import { formatContextPlanForAudit, planContextPack } from "./context.js"

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

  test("plans token budget and compresses repeated prompt text", () => {
    const text = "please please analyze this repo\n\nanalyze this repo\n\n".repeat(20)
    const plan = planTokenBudget({ text, maxContextTokens: 512, reservedOutputTokens: 128 })
    const compressed = compressSemantically({ text, targetRatio: 0.5 })

    expect(estimateTokens(text)).toBeGreaterThan(0)
    expect(plan.availableInputTokens).toBe(384)
    expect(compressed.compressedEstimatedTokens).toBeLessThan(compressed.originalEstimatedTokens)
  })

  test("rewrites user requests into clearer LLM-ready semantics", () => {
    const rewritten = rewriteSemantics({
      request: "can you maybe optimize the sql thing",
      mode: "llm_prompt",
      constraints: ["preserve user intent"],
    })

    expect(rewritten.detectedIntent).toBe("database")
    expect(rewritten.rewritten).toContain("Constraints")
    expect(rewritten.improvements.length).toBeGreaterThan(0)
  })

  test("detects common SQL optimization opportunities", () => {
    const plan = analyzeSqlOptimization({
      dialect: "postgres",
      query: "SELECT * FROM users WHERE email LIKE '%@example.com' ORDER BY created_at OFFSET 1000",
      schemaSummary: "users(id, email, created_at)",
    })

    expect(plan.intent).toBe("read_query")
    expect(plan.findings.some((finding) => finding.category === "index")).toBe(true)
    expect(plan.findings.some((finding) => finding.category === "pagination")).toBe(true)
  })

  test("protects the user's machine with recyclable resource planning", () => {
    const memoryOnly = planMachineResourceUse({ operation: "classify prompt" })
    const temp = planMachineResourceUse({
      operation: "rerank local snippets",
      estimatedBytesToWrite: 4096,
      filesToCreate: 1,
      containsUserData: true,
      canRegenerate: true,
    })
    const persistent = planMachineResourceUse({
      operation: "persist embedding index",
      estimatedBytesToWrite: 1024,
      filesToCreate: 1,
      persistent: true,
      containsUserData: true,
    })

    expect(memoryOnly.posture).toBe("memory_only")
    expect(temp.posture).toBe("recycle_temp")
    expect(temp.cleanup.strategy).toBe("delete_temp")
    expect(persistent.requiresApproval).toBe(true)
    expect(formatMachineResourcePlan(persistent)).toContain("requires_approval=true")
  })

  test("builds expectation contracts that reject generic AI output", () => {
    const contract = inferExpectationContract({
      request: "keep working on the ML and avoid AI slop or generic garbage",
    })
    const prompt = formatExpectationContractForPrompt(contract)

    expect(contract.qualityBar).toBe("strict")
    expect(contract.mustAvoid).toContain("AI slop")
    expect(prompt).toContain("quality_bar=strict")
  })

  test("quality gate asks for silent revision when response is generic", () => {
    const expectation = inferExpectationContract({ request: "avoid generic output and give specific implementation details" })
    const result = evaluateResponseQuality({
      request: "avoid generic output and give specific implementation details",
      response: "Use best practices to build a robust and scalable solution that streamlines the workflow.",
      expectation,
    })

    expect(result.verdict).toBe("revise_silently")
    expect(result.problems.length).toBeGreaterThan(0)
  })

  test("builds focused revision prompts for failed quality gates", () => {
    const expectation = inferExpectationContract({ request: "avoid generic output and give specific implementation details" })
    const result = evaluateResponseQuality({
      request: "avoid generic output and give specific implementation details",
      response: "Use best practices to build a robust solution.",
      expectation,
    })
    const revisionPrompt = buildRevisionPrompt(result)

    expect(revisionPrompt).toContain("Revise the previous answer")
    expect(revisionPrompt).toContain("Do not mention this quality gate")
    expect(revisionPrompt).toContain("Generic phrases detected")
  })

  test("response pipeline stays low-interference by revising silently", () => {
    const preflight = prepareResponsePreflight({ request: "avoid AI slop and make this specific" })
    const postflight = evaluateResponsePostflight({
      request: "avoid AI slop and make this specific",
      response: "This is an innovative and comprehensive approach.",
      expectation: preflight.expectation,
    })

    expect(preflight.promptAddendum).toContain("avoid generic output")
    expect(postflight.shouldRevise).toBe(true)
    expect(postflight.shouldAskUser).toBe(false)
    expect(postflight.revisionPrompt).toContain("Revise the previous answer")
  })

  test("plans context packs by including, summarizing, and dropping items", () => {
    const plan = planContextPack({
      request: "fix the TypeScript quality gate and run tests",
      maxInputTokens: 220,
      reservedTokens: 40,
      items: [
        {
          id: "request",
          kind: "request",
          content: "fix the TypeScript quality gate and run tests",
          pinned: true,
          canDrop: false,
        },
        {
          id: "quality.ts",
          kind: "file",
          title: "packages/ml/src/quality.ts",
          content: "export function evaluateResponseQuality() { return 'quality gate' }".repeat(20),
          tags: ["typescript", "quality", "gate"],
          canSummarize: true,
        },
        {
          id: "marketing",
          kind: "memory",
          title: "marketing copy",
          content: "brand voice landing page social copy".repeat(20),
          canDrop: true,
        },
      ],
    })

    expect(plan.included.some((item) => item.id === "request")).toBe(true)
    expect(plan.summarize.some((item) => item.id === "quality.ts")).toBe(true)
    expect(plan.drop.some((item) => item.id === "marketing")).toBe(true)
    expect(formatContextPlanForAudit(plan)).toContain("summarize=1")
  })
})

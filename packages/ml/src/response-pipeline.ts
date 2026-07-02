import { inferExpectationContract, type ExpectationContract, type ExpectationInput } from "./expectation.js"
import { buildRevisionPrompt, evaluateResponseQuality, type QualityGateInput, type QualityGateResult } from "./quality.js"
import { planTokenBudget, type TokenBudgetPlan } from "./token.js"
import { planMachineResourceUse, type MachineResourceInput, type MachineResourcePlan } from "./machine.js"
import { planThinking, type ThinkingPlan } from "./thinking.js"

export type ResponsePipelinePreflightInput = ExpectationInput & {
  maxContextTokens?: number
  reservedOutputTokens?: number
  machine?: MachineResourceInput
  availableTools?: string[]
  priorTurnCount?: number
  hasToolHistory?: boolean
}

export type ResponsePipelinePreflight = {
  expectation: ExpectationContract
  tokenBudget: TokenBudgetPlan
  machine: MachineResourcePlan
  thinking: ThinkingPlan
  promptAddendum: string
}

export type ResponsePipelinePostflightInput = Omit<QualityGateInput, "expectation"> & {
  expectation: ExpectationContract
}

export type ResponsePipelinePostflight = {
  quality: QualityGateResult
  shouldRespond: boolean
  shouldRevise: boolean
  shouldAskUser: boolean
  revisionPrompt: string | null
}
export function prepareResponsePreflight(input: ResponsePipelinePreflightInput): ResponsePipelinePreflight {
  const expectation = inferExpectationContract(input)
  const tokenBudget = planTokenBudget({
    text: input.request,
    maxContextTokens: input.maxContextTokens,
    reservedOutputTokens: input.reservedOutputTokens,
  })
  const machine = planMachineResourceUse(input.machine ?? { operation: "response preflight" })
  const thinking = planThinking({
    request: input.request,
    deliverable: expectation.deliverable,
    qualityBar: expectation.qualityBar,
    evidenceNeed: expectation.evidenceNeed,
    availableTools: input.availableTools,
    priorTurnCount: input.priorTurnCount,
    hasToolHistory: input.hasToolHistory,
  })
  const promptAddendum = [
    "<arcana-response-pipeline>",
    `quality_bar=${expectation.qualityBar}`,
    `deliverable=${expectation.deliverable}`,
    `evidence_need=${expectation.evidenceNeed}`,
    `token_status=${tokenBudget.status}`,
    `machine_posture=${machine.posture}`,
    thinking.promptAddendum,
    "rules=avoid generic output; preserve user intent; revise silently when quality is low; ask only when ambiguity blocks correctness",
    "</arcana-response-pipeline>",
  ].join("\n")

  return { expectation, tokenBudget, machine, thinking, promptAddendum }
}

export function evaluateResponsePostflight(input: ResponsePipelinePostflightInput): ResponsePipelinePostflight {
  const quality = evaluateResponseQuality(input)
  const shouldRevise = quality.verdict === "revise_silently"
  const shouldAskUser = quality.verdict === "ask_user"
  return {
    quality,
    shouldRespond: quality.verdict === "pass",
    shouldRevise,
    shouldAskUser,
    revisionPrompt: shouldRevise ? buildRevisionPrompt(quality) : null,
  }
}

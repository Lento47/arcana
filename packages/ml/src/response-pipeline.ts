import { inferExpectationContract, type ExpectationContract, type ExpectationInput } from "./expectation.js"
import { evaluateResponseQuality, type QualityGateInput, type QualityGateResult } from "./quality.js"
import { planTokenBudget, type TokenBudgetPlan } from "./token.js"
import { planMachineResourceUse, type MachineResourceInput, type MachineResourcePlan } from "./machine.js"

export type ResponsePipelinePreflightInput = ExpectationInput & {
  maxContextTokens?: number
  reservedOutputTokens?: number
  machine?: MachineResourceInput
}

export type ResponsePipelinePreflight = {
  expectation: ExpectationContract
  tokenBudget: TokenBudgetPlan
  machine: MachineResourcePlan
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
}

export function prepareResponsePreflight(input: ResponsePipelinePreflightInput): ResponsePipelinePreflight {
  const expectation = inferExpectationContract(input)
  const tokenBudget = planTokenBudget({
    text: input.request,
    maxContextTokens: input.maxContextTokens,
    reservedOutputTokens: input.reservedOutputTokens,
  })
  const machine = planMachineResourceUse(input.machine ?? { operation: "response preflight" })
  const promptAddendum = [
    "<arcana-response-pipeline>",
    `quality_bar=${expectation.qualityBar}`,
    `deliverable=${expectation.deliverable}`,
    `evidence_need=${expectation.evidenceNeed}`,
    `token_status=${tokenBudget.status}`,
    `machine_posture=${machine.posture}`,
    "rules=avoid generic output; preserve user intent; revise silently when quality is low; ask only when ambiguity blocks correctness",
    "</arcana-response-pipeline>",
  ].join("\n")

  return { expectation, tokenBudget, machine, promptAddendum }
}

export function evaluateResponsePostflight(input: ResponsePipelinePostflightInput): ResponsePipelinePostflight {
  const quality = evaluateResponseQuality(input)
  return {
    quality,
    shouldRespond: quality.verdict === "pass",
    shouldRevise: quality.verdict === "revise_silently",
    shouldAskUser: quality.verdict === "ask_user",
  }
}

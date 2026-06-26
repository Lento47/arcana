// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaSecurityRisk } from "./security-context"

export const ARCANA_PIPELINES = ["fix", "feature", "security", "forge", "migration", "research"] as const
export type ArcanaPipelineKind = (typeof ARCANA_PIPELINES)[number]

export const ARCANA_PIPELINE_STAGE_KINDS = [
  "intent_contract",
  "reproduce",
  "localize",
  "architecture_map",
  "threat_model",
  "plan_search",
  "candidate_generation",
  "candidate_scoring",
  "diff_gate",
  "test",
  "security_scan",
  "benchmark",
  "verifier",
  "proof_export",
] as const

export type ArcanaPipelineStageKind = (typeof ARCANA_PIPELINE_STAGE_KINDS)[number]

export type ArcanaPipelineBudget = {
  readonly max_candidates: number
  readonly max_model_calls: number
  readonly max_wall_clock_minutes: number
  readonly verifier_required: boolean
  readonly human_review_required: boolean
}

export type ArcanaAcceptanceCriterion = {
  readonly id: string
  readonly description: string
  readonly evidence_required: readonly string[]
}

export type ArcanaPipelineStage = {
  readonly id: string
  readonly kind: ArcanaPipelineStageKind
  readonly title: string
  readonly authority: "model" | "kernel" | "diff_gate" | "verifier" | "human"
  readonly required: boolean
}

export type ArcanaPipelinePlan = {
  readonly id: string
  readonly pipeline: ArcanaPipelineKind
  readonly objective: string
  readonly risk: ArcanaSecurityRisk
  readonly stages: readonly ArcanaPipelineStage[]
  readonly acceptance_criteria: readonly ArcanaAcceptanceCriterion[]
  readonly budget: ArcanaPipelineBudget
  readonly stop_conditions: readonly string[]
}

function stage(kind: ArcanaPipelineStageKind, title: string, authority: ArcanaPipelineStage["authority"], required = true): ArcanaPipelineStage {
  return { id: kind, kind, title, authority, required }
}

export function requiredStagesForPipeline(pipeline: ArcanaPipelineKind): ArcanaPipelineStage[] {
  if (pipeline === "fix") {
    return [
      stage("intent_contract", "Capture fix objective and failure signal", "kernel"),
      stage("reproduce", "Reproduce or encode the failing behavior", "kernel"),
      stage("localize", "Localize likely root cause", "model"),
      stage("candidate_generation", "Generate bounded patch candidates", "model"),
      stage("candidate_scoring", "Score candidates by risk and evidence", "kernel"),
      stage("diff_gate", "Route selected mutation through DiffGate", "diff_gate"),
      stage("test", "Run targeted and regression tests", "kernel"),
      stage("verifier", "Independently judge completion", "verifier"),
      stage("proof_export", "Export RunProof evidence", "kernel"),
    ]
  }

  if (pipeline === "feature") {
    return [
      stage("intent_contract", "Capture requirement contract", "kernel"),
      stage("architecture_map", "Map touched architecture and compatibility surface", "model"),
      stage("plan_search", "Compare implementation plans", "model"),
      stage("candidate_generation", "Generate candidate diffs", "model"),
      stage("candidate_scoring", "Score correctness, maintainability, and rollback safety", "kernel"),
      stage("diff_gate", "Route selected mutation through DiffGate", "diff_gate"),
      stage("test", "Run contract, unit, and integration checks", "kernel"),
      stage("verifier", "Verify requirement satisfaction and compat risk", "verifier"),
      stage("proof_export", "Export RunProof evidence", "kernel"),
    ]
  }

  if (pipeline === "security") {
    return [
      stage("intent_contract", "Capture security objective and assets", "kernel"),
      stage("threat_model", "Map assets, abuse cases, and trust boundaries", "kernel"),
      stage("plan_search", "Compare mitigation strategies", "model"),
      stage("candidate_generation", "Generate secure patch candidates", "model"),
      stage("candidate_scoring", "Score candidates with security-weighted criteria", "kernel"),
      stage("diff_gate", "Route selected mutation through DiffGate", "diff_gate"),
      stage("security_scan", "Run security scanners and negative checks", "kernel"),
      stage("verifier", "Red-team completion and evidence", "verifier"),
      stage("proof_export", "Export RunProof evidence", "kernel"),
    ]
  }

  if (pipeline === "forge") {
    return [
      stage("intent_contract", "Define optimization objective and baseline", "kernel"),
      stage("plan_search", "Explore search strategies", "model"),
      stage("candidate_generation", "Generate diverse candidate implementations", "model"),
      stage("candidate_scoring", "Score candidates by objective, safety, and novelty", "kernel"),
      stage("benchmark", "Benchmark against baseline", "kernel"),
      stage("security_scan", "Check generated candidates for unsafe behavior", "kernel"),
      stage("diff_gate", "Route selected mutation through DiffGate", "diff_gate"),
      stage("verifier", "Verify claimed improvement", "verifier"),
      stage("proof_export", "Export RunProof evidence", "kernel"),
    ]
  }

  if (pipeline === "migration") {
    return [
      stage("intent_contract", "Capture migration target and compatibility promise", "kernel"),
      stage("architecture_map", "Map legacy and native authority boundaries", "kernel"),
      stage("plan_search", "Create expand-contract migration plan", "model"),
      stage("candidate_generation", "Generate compatibility-preserving slices", "model"),
      stage("candidate_scoring", "Score replay safety and shim decay", "kernel"),
      stage("diff_gate", "Route migration slice through DiffGate", "diff_gate"),
      stage("test", "Run replay, unit, and compat checks", "kernel"),
      stage("verifier", "Verify no hidden authority regression", "verifier"),
      stage("proof_export", "Export RunProof evidence", "kernel"),
    ]
  }

  return [
    stage("intent_contract", "Capture research question and evidence standard", "kernel"),
    stage("plan_search", "Plan source and experiment strategy", "model"),
    stage("candidate_generation", "Generate hypotheses or candidate designs", "model"),
    stage("candidate_scoring", "Score claims by evidence quality", "kernel"),
    stage("verifier", "Check claims and limitations", "verifier"),
    stage("proof_export", "Export RunProof evidence", "kernel"),
  ]
}

export function defaultBudgetForPipeline(pipeline: ArcanaPipelineKind, risk: ArcanaSecurityRisk): ArcanaPipelineBudget {
  const riskMultiplier = risk === "critical" ? 4 : risk === "high" ? 3 : risk === "medium" ? 2 : 1
  const baseCandidates = pipeline === "forge" ? 8 : pipeline === "security" ? 4 : 2

  return {
    max_candidates: Math.max(baseCandidates, baseCandidates * riskMultiplier),
    max_model_calls: 8 * riskMultiplier,
    max_wall_clock_minutes: pipeline === "forge" ? 60 * riskMultiplier : 20 * riskMultiplier,
    verifier_required: risk !== "low" || pipeline === "security" || pipeline === "forge" || pipeline === "migration",
    human_review_required: risk === "critical" || pipeline === "security",
  }
}

export function defaultAcceptanceCriteria(pipeline: ArcanaPipelineKind): ArcanaAcceptanceCriterion[] {
  const common: ArcanaAcceptanceCriterion[] = [
    {
      id: "runproof-complete",
      description: "RunProof contains objective, actions, policy decisions, mutations, verifier result, limitations, and rollback state.",
      evidence_required: ["runproof_log"],
    },
  ]

  if (pipeline === "fix") {
    return [
      { id: "failure-fixed", description: "The original failure is reproduced or encoded and then passes.", evidence_required: ["test_output"] },
      { id: "regression-safe", description: "Targeted regression surface remains green.", evidence_required: ["test_output", "typecheck_output"] },
      ...common,
    ]
  }

  if (pipeline === "feature") {
    return [
      { id: "requirement-met", description: "The stated requirement is satisfied by executable evidence.", evidence_required: ["test_output"] },
      { id: "compat-preserved", description: "Public behavior and compatibility promises are preserved or versioned.", evidence_required: ["git_diff", "typecheck_output"] },
      ...common,
    ]
  }

  if (pipeline === "security") {
    return [
      { id: "risk-reduced", description: "Threat or vulnerability risk is reduced with negative evidence.", evidence_required: ["security_scan", "test_output"] },
      { id: "human-review", description: "High-impact security changes carry explicit human review evidence.", evidence_required: ["manual_confirmation"] },
      ...common,
    ]
  }

  if (pipeline === "forge") {
    return [
      { id: "baseline-improved", description: "Candidate improves a measured baseline without correctness regression.", evidence_required: ["benchmark", "test_output"] },
      { id: "novelty-claimed-carefully", description: "Novelty or optimization claims are limited to measured evidence.", evidence_required: ["runproof_log"] },
      ...common,
    ]
  }

  if (pipeline === "migration") {
    return [
      { id: "replay-safe", description: "Replay or compatibility corpus shows no unintended behavior delta.", evidence_required: ["test_output", "runproof_log"] },
      { id: "shim-decay-visible", description: "Compatibility shim usage is tracked with removal signal.", evidence_required: ["runproof_log"] },
      ...common,
    ]
  }

  return [
    { id: "claims-supported", description: "Research claims are supported by cited or executable evidence.", evidence_required: ["runproof_log"] },
    ...common,
  ]
}

export function createPipelinePlan(input: {
  readonly id?: string
  readonly pipeline: ArcanaPipelineKind
  readonly objective: string
  readonly risk: ArcanaSecurityRisk
  readonly stages?: readonly ArcanaPipelineStage[]
  readonly acceptance_criteria?: readonly ArcanaAcceptanceCriterion[]
  readonly budget?: ArcanaPipelineBudget
  readonly stop_conditions?: readonly string[]
}): ArcanaPipelinePlan {
  return {
    id: input.id ?? `pipe_${input.pipeline}`,
    pipeline: input.pipeline,
    objective: input.objective,
    risk: input.risk,
    stages: input.stages ?? requiredStagesForPipeline(input.pipeline),
    acceptance_criteria: input.acceptance_criteria ?? defaultAcceptanceCriteria(input.pipeline),
    budget: input.budget ?? defaultBudgetForPipeline(input.pipeline, input.risk),
    stop_conditions: input.stop_conditions ?? [
      "policy-denied",
      "required-evidence-missing",
      "verifier-failed",
      "budget-exhausted",
      "rollback-unavailable-for-high-risk-mutation",
    ],
  }
}

export function pipelineHasRequiredAuthorities(plan: ArcanaPipelinePlan): boolean {
  const authorities = new Set(plan.stages.map((stage) => stage.authority))
  return authorities.has("kernel") && authorities.has("diff_gate") && authorities.has("verifier")
}

export function pipelineRequiresVerifier(plan: ArcanaPipelinePlan): boolean {
  return plan.budget.verifier_required || plan.stages.some((stage) => stage.authority === "verifier" && stage.required)
}

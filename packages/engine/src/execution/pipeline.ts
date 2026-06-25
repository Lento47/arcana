// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { Schema } from "effect"
import { EngineActionID, RequiredControl } from "./action"

export const PipelineID = Schema.String.pipe(Schema.brand("PipelineID"))
export type PipelineID = typeof PipelineID.Type

export const PipelineKind = Schema.Literals(["fix", "feature", "security", "refactor", "forge", "research"])
export type PipelineKind = typeof PipelineKind.Type

export const AcceptanceCriterion = Schema.Struct({
  id: Schema.String,
  description: Schema.String,
  verification: Schema.Literals(["test", "typecheck", "lint", "build", "manual", "verifier", "benchmark", "security_check"]),
  required: Schema.Boolean,
})
export type AcceptanceCriterion = typeof AcceptanceCriterion.Type

export const PipelineStageStatus = Schema.Literals(["pending", "running", "passed", "failed", "skipped"])
export type PipelineStageStatus = typeof PipelineStageStatus.Type

export const PipelineStage = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  purpose: Schema.String,
  status: PipelineStageStatus,
  action_ids: Schema.Array(EngineActionID),
  required_controls: Schema.Array(RequiredControl),
})
export type PipelineStage = typeof PipelineStage.Type

export const StopCondition = Schema.Struct({
  id: Schema.String,
  reason: Schema.String,
  severity: Schema.Literals(["info", "warning", "hard_stop"]),
})
export type StopCondition = typeof StopCondition.Type

export const VerificationBudget = Schema.Struct({
  max_wall_time_ms: Schema.optional(Schema.Number),
  max_model_calls: Schema.optional(Schema.Number),
  max_shell_commands: Schema.optional(Schema.Number),
  require_verifier: Schema.Boolean,
  require_human_review: Schema.Boolean,
})
export type VerificationBudget = typeof VerificationBudget.Type

export const PipelinePlan = Schema.Struct({
  id: PipelineID,
  pipeline: PipelineKind,
  objective: Schema.String,
  acceptance_criteria: Schema.Array(AcceptanceCriterion),
  stages: Schema.Array(PipelineStage),
  stop_conditions: Schema.Array(StopCondition),
  verification_budget: VerificationBudget,
})
export type PipelinePlan = typeof PipelinePlan.Type

export function newPipelineID(): PipelineID {
  return PipelineID.make(`pipe_${crypto.randomUUID()}`)
}

export function createPipelinePlan(input: Omit<PipelinePlan, "id"> & { id?: PipelineID }): PipelinePlan {
  return {
    id: input.id ?? newPipelineID(),
    pipeline: input.pipeline,
    objective: input.objective,
    acceptance_criteria: input.acceptance_criteria,
    stages: input.stages,
    stop_conditions: input.stop_conditions,
    verification_budget: input.verification_budget,
  }
}

export function defaultPipelineStages(kind: PipelineKind): PipelineStage[] {
  const base: Array<Omit<PipelineStage, "id" | "status" | "action_ids">> = (() => {
    switch (kind) {
      case "fix":
        return [
          { name: "reproduce", purpose: "Prove the failure before patching.", required_controls: [] },
          { name: "localize", purpose: "Find the minimal cause and affected surface.", required_controls: [] },
          { name: "patch", purpose: "Create the smallest safe diff.", required_controls: ["diff", "checkpoint"] },
          { name: "verify", purpose: "Run targeted and regression verification.", required_controls: ["verifier"] },
        ]
      case "security":
        return [
          { name: "threat_model", purpose: "Identify assets, trust boundaries, and abuse cases.", required_controls: ["human_review"] },
          { name: "secure_patch", purpose: "Propose a security-preserving mutation.", required_controls: ["diff", "checkpoint"] },
          { name: "negative_tests", purpose: "Add tests that fail against the vulnerable behavior.", required_controls: ["verifier"] },
          { name: "red_team_review", purpose: "Critically review exploitability and bypasses.", required_controls: ["verifier", "human_review"] },
        ]
      case "forge":
        return [
          { name: "objective", purpose: "Define measurable objective and scoring function.", required_controls: [] },
          { name: "candidates", purpose: "Generate multiple candidate implementations.", required_controls: ["sandbox"] },
          { name: "evaluate", purpose: "Benchmark and score candidates against objective.", required_controls: ["verifier"] },
          { name: "select", purpose: "Choose the best evidence-backed candidate.", required_controls: ["diff", "checkpoint"] },
        ]
      default:
        return [
          { name: "contract", purpose: "Convert user intent into acceptance criteria.", required_controls: [] },
          { name: "plan", purpose: "Plan implementation with affected surface.", required_controls: [] },
          { name: "implement", purpose: "Propose and apply controlled changes.", required_controls: ["diff", "checkpoint"] },
          { name: "verify", purpose: "Verify correctness and quality before completion.", required_controls: ["verifier"] },
        ]
    }
  })()

  return base.map((stage) => ({
    id: `stage_${stage.name}`,
    status: "pending",
    action_ids: [],
    ...stage,
  }))
}

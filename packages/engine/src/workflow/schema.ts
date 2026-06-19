import { Schema } from "effect"

export const WorkflowStep = Schema.Struct({
  id: Schema.String,
  type: Schema.Literals(["subagent", "prompt", "merge", "condition"]),
  dependsOn: Schema.optional(Schema.Array(Schema.String)),
  description: Schema.String,
  subagent_type: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  sources: Schema.optional(Schema.Array(Schema.String)),
  mergeStrategy: Schema.optional(Schema.Literals(["concat", "summarize", "conflict_resolve"])),
  // condition steps: evaluate `condition` (a JS expression over prior step outputs,
  // each output bound by its step id) → boolean. The branch NOT taken (its listed
  // step ids) is marked skipped; skip propagates to steps whose deps are all skipped.
  condition: Schema.optional(Schema.String),
  ifTrue: Schema.optional(Schema.Array(Schema.String)),
  ifFalse: Schema.optional(Schema.Array(Schema.String)),
  timeout: Schema.optional(Schema.Number),
  background: Schema.optional(Schema.Boolean),
})
export type WorkflowStep = Schema.Schema.Type<typeof WorkflowStep>

export const WorkflowPlan = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  // Either author `steps` explicitly, or give a `goal` and let the engine
  // generate the steps (auto-orchestration). At least one must be present.
  steps: Schema.optional(Schema.Array(WorkflowStep)),
  goal: Schema.optional(Schema.String),
})
export type WorkflowPlan = Schema.Schema.Type<typeof WorkflowPlan>

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped"

export interface StepRun {
  id: string
  type: WorkflowStep["type"]
  status: StepStatus
  output?: string
  error?: string
}

export interface WorkflowSnapshot {
  steps: StepRun[]
  done: boolean
}

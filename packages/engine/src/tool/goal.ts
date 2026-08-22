import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import {
  getSessionGoal,
  claimSessionGoalCompletion,
  patchSessionGoal,
  setSessionGoal,
  type GoalPriority,
} from "@arcana/core/session/goal"
import DESCRIPTION_SET from "./goal-set.txt"
import DESCRIPTION_CHECK from "./goal-check.txt"

const SetParams = Schema.Struct({
  goal: Schema.String.annotate({
    description: "The user's goal — what they asked to be done. Be specific and complete.",
  }),
  scope: Schema.optional(
    Schema.String.annotate({
      description: "Scope boundaries: what's in scope, what's explicitly out of scope.",
    }),
  ),
  priority: Schema.optional(
    Schema.Literals(["high", "medium", "low"]).annotate({
      description: "How important is this goal?",
    }),
  ),
})

const CheckParams = Schema.Struct({
  status: Schema.Literals(["in_progress", "complete", "blocked", "stale"]).annotate({
    description: "Current status of the work toward the active goal",
  }),
  done: Schema.optional(Schema.String.annotate({ description: "What has been accomplished so far." })),
  pending: Schema.optional(Schema.String.annotate({ description: "What still needs to be done." })),
  blocked: Schema.optional(Schema.String.annotate({ description: "Any blockers or obstacles." })),
})

type SetMetadata = {
  goal: string
  status: string
}

type CheckMetadata = {
  status: string
  goal?: string
}

export const GoalSetTool = Tool.define<typeof SetParams, SetMetadata, never>("goal_set", Effect.succeed({
  description: DESCRIPTION_SET,
  parameters: SetParams,
  execute: (params: Schema.Schema.Type<typeof SetParams>, ctx: Tool.Context<SetMetadata>) =>
    Effect.sync(() => {
      const current = getSessionGoal(ctx.sessionID)
      if (current.status === "complete_pending_verify") {
        return {
          title: "goal awaiting verification",
          output:
            "The current goal is awaiting independent verification. Do not replace it to unlock mutation tools. " +
            "Wait for the verdict; if the user explicitly changes objectives, they can use /goal.",
          metadata: { goal: current.goal, status: current.status },
        }
      }
      const priority = (params.priority ?? "medium") as GoalPriority
      const snap = setSessionGoal(ctx.sessionID, {
        goal: params.goal,
        scope: params.scope,
        priority,
        status: "in_progress",
        boardSessionID: ctx.sessionID,
      })
      return {
        title: "goal set",
        output: [
          `Goal recorded for session ${ctx.sessionID}.`,
          `goal: ${snap.goal}`,
          `scope: ${snap.scope}`,
          `priority: ${snap.priority}`,
          `status: ${snap.status}`,
          "",
          "This goal is now active. Align subsequent work with it.",
          "Mutation tools for build/general/tester are unlocked while status is in_progress.",
        ].join("\n"),
        metadata: {
          goal: snap.goal,
          status: snap.status,
        },
      }
    }),
}))

export const GoalCheckTool = Tool.define<typeof CheckParams, CheckMetadata, never>("goal_check", Effect.succeed({
  description: DESCRIPTION_CHECK,
  parameters: CheckParams,
  execute: (params: Schema.Schema.Type<typeof CheckParams>, ctx: Tool.Context<CheckMetadata>) =>
    Effect.sync(() => {
      const cur = getSessionGoal(ctx.sessionID)
      if (cur.status === "unset") {
        return {
          title: "no goal",
          output: "No active goal set. Call goal_set first (or the user can use /goal in the TUI).",
          metadata: { status: "unset" },
        }
      }

      if (params.status === "complete") {
        claimSessionGoalCompletion(ctx.sessionID)
      } else if (params.status === "blocked" || params.status === "stale" || params.status === "in_progress") {
        patchSessionGoal(ctx.sessionID, { status: params.status })
      }

      const lines = [
        `**Check status:** ${params.status}`,
        `**Done:** ${params.done?.trim() || "nothing yet"}`,
        `**Pending:** ${params.pending?.trim() || "unknown"}`,
        `**Blocked:** ${params.blocked?.trim() || "none"}`,
      ]

      if (params.status === "complete") {
        lines.push(
          "",
          "COMPLETION CLAIMED (complete_pending_verify). Mutation tools are frozen while an independent verifier checks the exact goal revision.",
          "Summarize for the user. Do not invent or set a replacement goal to unlock tools.",
        )
      } else if (params.status === "blocked") {
        lines.push("", "Blocked. Ask the user for guidance or change approach.")
      } else if (params.status === "stale") {
        lines.push("", "Goal may be stale. Confirm with the user before continuing.")
      }

      return {
        title: `goal ${params.status}`,
        output: lines.join("\n"),
        metadata: {
          status: params.status,
          goal: cur.goal,
        },
      }
    }),
}))

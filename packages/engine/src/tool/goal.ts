import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import {
  getSessionGoal,
  claimSessionGoalCompletion,
  patchSessionGoal,
  setSessionGoal,
  resolveSessionGoalVerification,
  type GoalPriority,
} from "@arcana/core/session/goal"
import { runChecks, formatCheckResult, type CheckName } from "../session/check-runner"
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
  checks: Schema.optional(
    Schema.Array(
      Schema.Literals(["test", "typecheck", "build", "lint"]).annotate({
        description: "Verification checks to run when status is complete (e.g. ['test', 'typecheck'])",
      }),
    ).annotate({
      description: "List of checks to run for verification. If empty or omitted, no checks run.",
    }),
  ),
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
            "The current goal is awaiting verification. Do not replace it to unlock mutation tools. " +
            "Wait for verification to complete; if the user explicitly changes objectives, they can use /goal.",
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
    Effect.gen(function* () {
      const cur = getSessionGoal(ctx.sessionID)
      if (cur.status === "unset") {
        return {
          title: "no goal",
          output: "No active goal set. Call goal_set first (or the user can use /goal in the TUI).",
          metadata: { status: "unset" },
        }
      }

      // Non-complete status updates
      if (params.status !== "complete") {
        patchSessionGoal(ctx.sessionID, { status: params.status })

        const lines = [
          `**Check status:** ${params.status}`,
          `**Done:** ${params.done?.trim() || "nothing yet"}`,
          `**Pending:** ${params.pending?.trim() || "unknown"}`,
          `**Blocked:** ${params.blocked?.trim() || "none"}`,
        ]

        if (params.status === "blocked") {
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
      }

      // Status === "complete": Run deterministic checks
      const checks = params.checks ?? []

      if (checks.length === 0) {
        // No checks specified — claim completion without running checks
        claimSessionGoalCompletion(ctx.sessionID)
        return {
          title: "goal completion claimed",
          output: [
            `**Check status:** complete`,
            `**Done:** ${params.done?.trim() || "work completed"}`,
            "",
            "COMPLETION CLAIMED. Mutation tools are frozen while verification runs.",
            "Summarize your work for the user.",
          ].join("\n"),
          metadata: {
            status: "complete_pending_verify",
            goal: cur.goal,
          },
        }
      }

      // Run the specified checks
      // Checks run in the SESSION's project directory (not the engine
      // process cwd), honor operator abort, and report per-check progress.
      const instanceCtx = yield* InstanceState.context
      const result = yield* Effect.tryPromise(() =>
        runChecks({
          checks: checks as CheckName[],
          cwd: instanceCtx.directory,
          signal: ctx.abort,
          onCheckStart: (name, index, total) => {
            void Effect.runPromise(
              ctx.metadata({
                title: `verifying ${index + 1}/${total}: ${name}…`,
                metadata: { status: "complete_pending_verify", goal: cur.goal },
              }),
            ).catch(() => {})
          },
        }),
      ).pipe(Effect.catch(() => Effect.succeed({
        passed: false,
        checks: [],
        summary: "Check runner failed",
      })))

      if (result.passed) {
        resolveSessionGoalVerification({
          sessionID: ctx.sessionID,
          goalID: cur.goalID,
          revision: cur.revision,
          result: {
            verdict: "verified",
            summary: result.summary,
            unmetCriteria: [],
            evidenceRefs: [],
          },
        })

        return {
          title: "goal verified",
          output: [
            `**Check status:** complete`,
            `**Done:** ${params.done?.trim() || "work completed"}`,
            "",
            formatCheckResult(result),
            "",
            "All checks passed. Goal verified and archived.",
          ].join("\n"),
          metadata: {
            status: "verified",
            goal: cur.goal,
          },
        }
      } else {
        return {
          title: "checks failed",
          output: [
            `**Check status:** complete (checks failed)`,
            `**Done:** ${params.done?.trim() || "work completed"}`,
            `**Pending:** Fix the errors below and re-run goal_check with status=complete`,
            "",
            formatCheckResult(result),
            "",
            "Fix the specific errors above, then call goal_check again with status=complete.",
            "Do not claim completion until all checks pass.",
          ].join("\n"),
          metadata: {
            status: "in_progress",
            goal: cur.goal,
          },
        }
      }
    }).pipe(Effect.orDie),
}))

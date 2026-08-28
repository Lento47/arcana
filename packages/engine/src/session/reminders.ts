import path from "path"
import { SessionV1 } from "@arcana/core/v1/session"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { FSUtil } from "@arcana/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "./session"
import BUILD_SWITCH from "./prompt/build-switch.txt"
import PLAN_MODE from "./prompt/plan-mode.txt"

export interface Result {
  readonly messages: SessionV1.WithParts[]
  /** Runtime-controlled instructions that belong in the privileged system context. */
  readonly system: readonly string[]
}

export const apply = Effect.fn("SessionReminders.apply")(function* (input: {
  messages: SessionV1.WithParts[]
  agent: Agent.Info
  session: Session.Info
}) {
  const flags = yield* RuntimeFlags.Service
  const fsys = yield* FSUtil.Service
  const system: string[] = []
  const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
  if (!userMessage) return { messages: input.messages, system }

  // Keep prompt guidance aligned with the agent and tool registry. A plan
  // reminder must never appear on a surface where plan mode cannot complete
  // its hand-off through the matching `plan_exit` tool.
  const planModeAvailable = RuntimeFlags.planModeAvailable(flags)
  if (!planModeAvailable) {
    const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
    if (wasPlan && input.agent.name === "build") {
      system.push(BUILD_SWITCH)
    }
    return { messages: input.messages, system }
  }

  const assistantMessage = input.messages.findLast((msg) => msg.info.role === "assistant")
  if (input.agent.name !== "plan" && assistantMessage?.info.agent === "plan") {
    const ctx = yield* InstanceState.context
    const plan = Session.plan(input.session, ctx)
    const exists = yield* fsys.existsSafe(plan)
    system.push(
      exists
        ? `${BUILD_SWITCH}\n\nA plan file exists at ${plan}. You should execute on the plan defined within it`
        : BUILD_SWITCH,
    )
    return { messages: input.messages, system }
  }

  if (input.agent.name !== "plan" || assistantMessage?.info.agent === "plan") {
    return { messages: input.messages, system }
  }

  const ctx = yield* InstanceState.context
  const plan = Session.plan(input.session, ctx)
  const exists = yield* fsys.existsSafe(plan)
  if (!exists) yield* fsys.ensureDir(path.dirname(plan)).pipe(Effect.catch(Effect.die))
  system.push(
    PLAN_MODE.replace("${planInfo}", () =>
      exists
        ? `A plan file already exists at ${plan}. You can read it and make incremental edits using the edit tool.`
        : `No plan file exists yet. You should create your plan at ${plan} using the write tool.`,
    ),
  )
  return { messages: input.messages, system }
})

export * as SessionReminders from "./reminders"

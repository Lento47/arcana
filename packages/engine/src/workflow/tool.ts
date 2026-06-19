import * as Tool from "../tool/tool"
import { WorkflowPlan, WorkflowStep } from "./schema"
import { createEngine } from "./engine"
import { Effect, Schema } from "effect"
import { ToolJsonSchema } from "../tool/json-schema"
import { TaskTool } from "../tool/task"
import { Provider } from "@/provider/provider"
import { generateText } from "ai"

const StepArray = Schema.Array(WorkflowStep)
const decodeSteps = Schema.decodeUnknownEffect(StepArray)

/** Best-effort JSON extraction from an LLM response (raw, fenced, or embedded). */
function extractJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {}
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenced) {
    try {
      return JSON.parse(fenced[1])
    } catch {}
  }
  const arr = text.match(/\[[\s\S]*\]/)
  if (arr) {
    try {
      return JSON.parse(arr[0])
    } catch {}
  }
  return undefined
}

const GEN_PROMPT = [
  "Decompose the goal below into an executable workflow: a JSON array of steps.",
  "Each step object: { \"id\": string (unique), \"type\": \"subagent\"|\"prompt\"|\"merge\"|\"condition\", \"description\": string,",
  "  \"dependsOn\"?: string[] (ids that must finish first), \"subagent_type\"?: string, \"prompt\"?: string,",
  "  \"sources\"?: string[] (for merge), \"condition\"?: string (JS expr over prior outputs), \"ifTrue\"?: string[], \"ifFalse\"?: string[] }.",
  "Rules: use `subagent` for work needing a specialized agent (subagent_type \"auto\" auto-routes to the best one);",
  "`prompt` for direct reasoning; `merge` to combine prior outputs (set `sources` to step ids); `condition` to branch",
  "(its `ifTrue`/`ifFalse` list the step ids to skip on the other branch). Reference earlier outputs with {{stepId}} in prompts.",
  "Steps with no shared dependency run in PARALLEL, so only add `dependsOn` when a step truly needs a prior result.",
  "Return ONLY the JSON array, no prose.",
].join("\n")

export const WorkflowTool = Tool.define(
  "workflow",
  Effect.gen(function* () {
    // Reuse the real task tool to drive subagent steps, and the provider to
    // serve one-shot `prompt` steps. Both are resolved once at construction.
    const taskDef = yield* Tool.init(yield* TaskTool)
    const provider = yield* Provider.Service

    return {
      description:
        "Define and execute a multi-step workflow with dependency-driven PARALLELISM. Steps with no shared " +
        "dependency run concurrently; use `dependsOn` only for real ordering. Step types: `subagent` (run a " +
        "specialized agent — subagent_type \"auto\" routes to the best one), `prompt` (one-shot LLM call), `merge` " +
        "(combine other steps' outputs via `sources`), `condition` (branch: evaluate `condition` over prior outputs, " +
        "skip the `ifTrue`/`ifFalse` ids on the untaken branch). Reference earlier outputs via `{{stepId}}`. " +
        "Instead of authoring `steps`, you may pass a high-level `goal` and the engine will plan the steps itself.",
      parameters: WorkflowPlan,
      jsonSchema: ToolJsonSchema.fromSchema(WorkflowPlan),
      execute: (params: WorkflowPlan, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const model = ctx.extra?.model as Provider.Model | undefined

          const promptLLM = (prompt: string) =>
            Effect.gen(function* () {
              if (!model) return ""
              const language = yield* provider.getLanguage(model)
              const response = yield* Effect.promise(() => generateText({ model: language, prompt }))
              return response.text
            }).pipe(Effect.orDie)

          // Auto-orchestration: no explicit steps but a goal → let the LLM plan.
          let steps = params.steps ?? []
          if (steps.length === 0 && params.goal) {
            const planned = yield* promptLLM(`${GEN_PROMPT}\n\nGoal: ${params.goal}`)
            steps = yield* decodeSteps(extractJson(planned)).pipe(Effect.catch(() => Effect.succeed([])))
          }

          if (steps.length === 0) {
            return {
              title: params.title,
              metadata: { workflow: true, steps: 0, completed: 0, failed: 0, skipped: 0 },
              output: "Workflow produced no steps. Provide `steps` or a `goal` the engine can decompose.",
            }
          }

          const engine = createEngine({
            concurrency: 8,
            runSubagent: (input) =>
              taskDef
                .execute(
                  { description: input.description, prompt: input.prompt, subagent_type: input.subagent_type },
                  ctx,
                )
                .pipe(Effect.map((result) => result.output)),
            promptLLM,
            // Live state: push a compact step-status line to the tool-call UI on
            // every transition so the workflow's progress is visible while it runs.
            onProgress: (snapshot) =>
              ctx
                .metadata({
                  title: params.title,
                  metadata: {
                    workflow: true,
                    steps: snapshot.steps.length,
                    done: snapshot.done,
                    progress: snapshot.steps.map((s) => `${s.id}:${s.status}`).join(" "),
                  },
                })
                .pipe(Effect.ignore),
          })

          const result = yield* engine.execute({ ...params, steps })

          const summary = result.runs
            .map((r) => `- ${r.id} [${r.status}]${r.error ? ` (${r.error})` : ""}`)
            .join("\n")
          return {
            title: params.title,
            metadata: {
              workflow: true,
              steps: result.runs.length,
              completed: result.runs.filter((r) => r.status === "completed").length,
              failed: result.runs.filter((r) => r.status === "failed").length,
              skipped: result.runs.filter((r) => r.status === "skipped").length,
            },
            output: [`Workflow "${params.title}" finished.`, summary, "", JSON.stringify(result.outputs, null, 2)].join(
              "\n",
            ),
          }
        }),
    }
  }),
)

import { Effect } from "effect"
import type { WorkflowPlan, WorkflowStep, StepRun, StepStatus, WorkflowSnapshot } from "./schema"

/**
 * Side-effecting capabilities the engine needs, injected by the workflow tool
 * from real services. Keeping them as plain Effect-returning functions keeps the
 * engine free of service/layer wiring and unit-testable with fakes.
 */
export interface WorkflowExecutors {
  /** Run a subagent task and return its text output. */
  readonly runSubagent: (input: {
    description: string
    prompt: string
    subagent_type: string
  }) => Effect.Effect<string, Error>
  /** Issue a one-shot LLM prompt and return the text response. */
  readonly promptLLM: (prompt: string) => Effect.Effect<string>
  /** Max steps to run at once (default 8). */
  readonly concurrency?: number
  /** Called on every state transition with the full current snapshot. */
  readonly onProgress?: (snapshot: WorkflowSnapshot) => Effect.Effect<void>
}

export interface EngineResult {
  outputs: Record<string, string>
  finalOutput: string | null
  runs: StepRun[]
}

export interface EngineInterface {
  readonly execute: (plan: WorkflowPlan) => Effect.Effect<EngineResult>
}

const isResolved = (status: StepStatus) =>
  status === "completed" || status === "skipped" || status === "failed"

export function createEngine(exec: WorkflowExecutors): EngineInterface {
  const concurrency = exec.concurrency ?? 8

  return {
    execute: Effect.fn("WorkflowEngine.execute")(function* (plan: WorkflowPlan) {
      const steps = plan.steps ?? []
      const runs = new Map<string, StepRun>(steps.map((s) => [s.id, { id: s.id, type: s.type, status: "pending" }]))
      const outputs: Record<string, string> = {}

      const status = (id: string): StepStatus => runs.get(id)?.status ?? "completed"
      const snapshot = (): WorkflowSnapshot => ({
        steps: steps.map((s) => ({ ...runs.get(s.id)! })),
        done: steps.every((s) => isResolved(runs.get(s.id)!.status)),
      })
      const emit = () => (exec.onProgress ? exec.onProgress(snapshot()) : Effect.void)

      // Mark a pending step skipped and cascade: any pending step whose deps are
      // now ALL skipped becomes unreachable and is skipped too.
      const markSkipped = (id: string) => {
        const run = runs.get(id)
        if (!run || run.status !== "pending") return
        run.status = "skipped"
        for (const s of steps) {
          if (runs.get(s.id)!.status !== "pending") continue
          const deps = s.dependsOn ?? []
          if (deps.length > 0 && deps.every((d) => status(d) === "skipped")) markSkipped(s.id)
        }
      }

      yield* emit()

      while (steps.some((s) => runs.get(s.id)!.status === "pending")) {
        const ready = steps.filter((s) => {
          if (runs.get(s.id)!.status !== "pending") return false
          return (s.dependsOn ?? []).every((d) => isResolved(status(d)))
        })

        if (ready.length === 0) {
          // Remaining pending steps are blocked (cycle or missing dependency).
          for (const s of steps) {
            const run = runs.get(s.id)!
            if (run.status === "pending") {
              run.status = "failed"
              run.error = "unresolved dependency or cycle"
            }
          }
          yield* emit()
          break
        }

        // Resolve condition steps synchronously first — they gate which downstream
        // branch runs, so they must settle before their dependents become ready.
        const conditions = ready.filter((s) => s.type === "condition")
        if (conditions.length > 0) {
          for (const s of conditions) {
            const run = runs.get(s.id)!
            const value = evalCondition(s.condition, outputs)
            run.status = "completed"
            run.output = String(value)
            outputs[s.id] = run.output
            for (const sid of (value ? s.ifFalse : s.ifTrue) ?? []) markSkipped(sid)
          }
          yield* emit()
          continue
        }

        for (const s of ready) runs.get(s.id)!.status = "running"
        yield* emit()

        const results = yield* Effect.all(
          ready.map((s) =>
            runStep(s, outputs, exec).pipe(
              Effect.map((output) => ({ id: s.id, ok: true as const, output })),
              Effect.catch((error) => Effect.succeed({ id: s.id, ok: false as const, error: errString(error) })),
            ),
          ),
          { concurrency },
        )

        for (const res of results) {
          const run = runs.get(res.id)!
          if (res.ok) {
            run.status = "completed"
            run.output = res.output
            outputs[res.id] = res.output
          } else {
            run.status = "failed"
            run.error = res.error
            outputs[res.id] = ""
          }
        }
        yield* emit()
      }

      const last = steps.length ? steps[steps.length - 1] : undefined
      return {
        outputs,
        finalOutput: last ? (outputs[last.id] ?? null) : null,
        runs: steps.map((s) => ({ ...runs.get(s.id)! })),
      }
    }),
  }
}

function runStep(
  step: WorkflowStep,
  outputs: Record<string, string>,
  exec: WorkflowExecutors,
): Effect.Effect<string, Error> {
  switch (step.type) {
    case "subagent":
      return exec.runSubagent({
        description: step.description,
        prompt: resolveTemplate(step.prompt ?? step.description, outputs),
        // "auto" lets the task tool route to the best subagent (auto-orchestration).
        subagent_type: step.subagent_type ?? "auto",
      })
    case "prompt":
      return exec.promptLLM(resolveTemplate(step.prompt ?? step.description, outputs))
    case "merge": {
      const sources: readonly string[] = step.sources ?? step.dependsOn ?? []
      return Effect.succeed(
        sources
          .map((id) => outputs[id])
          .filter((value): value is string => Boolean(value))
          .join("\n\n"),
      )
    }
    case "condition":
      // Conditions are resolved in the scheduler; never reached here.
      return Effect.succeed("")
  }
}

/**
 * Evaluates a condition expression with each prior step output bound to its step
 * id. The expression is author/model-supplied and runs in-process with only the
 * outputs in scope (same trust boundary as the model issuing tool calls).
 */
function evalCondition(expr: string | undefined, outputs: Record<string, string>): boolean {
  if (!expr) return false
  try {
    const keys = Object.keys(outputs)
    const fn = new Function(...keys, `"use strict"; return (${expr})`)
    return Boolean(fn(...keys.map((k) => outputs[k])))
  } catch {
    return false
  }
}

/** Substitutes `{{stepId}}` / `{{stepId.field}}` references with prior outputs. */
function resolveTemplate(template: string, outputs: Record<string, string>): string {
  return template.replace(/\{\{(\w+)(?:\.(\w+))?\}\}/g, (_, id: string, field?: string) => {
    const value = outputs[id]
    if (value === undefined) return `{{${id}}}`
    if (field) {
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === "object" && field in parsed) return String(parsed[field])
      } catch {}
      return value
    }
    return value
  })
}

function errString(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

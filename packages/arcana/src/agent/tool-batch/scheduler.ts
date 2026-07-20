/**
 * Bounded wave runner with WorkItem budgets + cancel trees (Phase 3).
 */
import { concurrencyForCapability } from "./plan.js"
import { mapPool, withTimeout } from "./pool.js"
import { formatBatchWavePlan, synthesizeBatchResult, truncateOutput } from "./synthesize.js"
import type {
  BatchConfig,
  BatchResult,
  BatchRunReport,
  ClassifiedCall,
  WorkItem,
  WorkItemStatus,
} from "./types.js"

export type BatchExecuteFn = (call: ClassifiedCall, signal: AbortSignal) => Promise<string>

export type RunBatchWavesInput = {
  waves: ClassifiedCall[][]
  config: BatchConfig
  execute: BatchExecuteFn
  signal?: AbortSignal
  timeoutMs?: number
  runId?: string
  parentId?: string
  /** Optional live projection (proof / TUI). */
  onEvent?: (event: BatchSchedulerEvent) => void
}

export type BatchSchedulerEvent =
  | { type: "run.start"; runId: string; planSummary: string; calls: number; waves: number }
  | { type: "wave.start"; runId: string; waveIndex: number; size: number; capability?: string }
  | { type: "item.start"; runId: string; itemId: string; name: string; waveIndex: number }
  | { type: "item.end"; runId: string; itemId: string; status: WorkItemStatus; durationMs: number }
  | { type: "run.end"; report: BatchRunReport }

function newRunId(): string {
  return `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Run capability/path waves with:
 * - per-child timeout + output cap
 * - total wall-clock budget (aborts remaining)
 * - parent AbortSignal fan-out to children
 * - WorkItem status tracking + synthesis for the parent model
 */
export async function runBatchWaves(input: RunBatchWavesInput): Promise<BatchRunReport> {
  const config = input.config
  const runId = input.runId ?? newRunId()
  const parent = input.signal
  const timeoutMs = input.timeoutMs ?? config.defaultTimeoutMs
  const planSummary = formatBatchWavePlan(input.waves)
  const started = Date.now()
  const deadline = started + config.maxTotalTimeMs

  const items: WorkItem[] = []
  for (let waveIndex = 0; waveIndex < input.waves.length; waveIndex++) {
    for (const call of input.waves[waveIndex]!) {
      items.push({
        ...call,
        dependsOn: [],
        budget: { timeoutMs, maxOutputChars: config.maxOutputChars },
        status: "pending",
        runId,
        parentId: input.parentId,
        waveIndex,
      })
    }
  }
  const byId = new Map(items.map((item) => [item.id, item]))

  const results: BatchResult[] = []
  let maxActive = 0
  const emit = (event: BatchSchedulerEvent) => {
    try {
      input.onEvent?.(event)
    } catch {
      // Projection must never break the batch.
    }
  }

  emit({
    type: "run.start",
    runId,
    planSummary,
    calls: items.length,
    waves: input.waves.length,
  })

  // Shared controller for total budget + parent abort.
  const runController = new AbortController()
  const onParentAbort = () => runController.abort()
  parent?.addEventListener("abort", onParentAbort, { once: true })
  const budgetTimer =
    config.maxTotalTimeMs > 0
      ? setTimeout(() => runController.abort(), Math.max(1, config.maxTotalTimeMs))
      : undefined

  try {
    for (let waveIndex = 0; waveIndex < input.waves.length; waveIndex++) {
      const wave = input.waves[waveIndex]!
      if (runController.signal.aborted || Date.now() >= deadline) {
        for (const call of wave) {
          const item = byId.get(call.id)!
          item.status = "cancelled"
          item.endedAt = Date.now()
          results.push({
            id: call.id,
            name: call.name,
            ok: false,
            output: "cancelled: batch budget or parent abort",
            status: "cancelled",
            capability: call.capability,
            waveIndex,
          })
        }
        continue
      }

      const capability = wave[0]?.capability
      emit({
        type: "wave.start",
        runId,
        waveIndex,
        size: wave.length,
        capability,
      })

      const limit = wave.length ? concurrencyForCapability(capability!, config) : 1

      const { results: waveResults, stats } = await mapPool(wave.length, limit, async (index) => {
        const call = wave[index]!
        const item = byId.get(call.id)!

        if (runController.signal.aborted) {
          item.status = "cancelled"
          item.endedAt = Date.now()
          return {
            id: call.id,
            name: call.name,
            ok: false,
            output: "cancelled: batch budget or parent abort",
            status: "cancelled" as const,
            capability: call.capability,
            waveIndex,
          } satisfies BatchResult
        }

        const child = new AbortController()
        const onRunAbort = () => child.abort()
        runController.signal.addEventListener("abort", onRunAbort, { once: true })

        item.status = "running"
        item.startedAt = Date.now()
        emit({ type: "item.start", runId, itemId: item.id, name: item.name, waveIndex })

        try {
          const raw = await withTimeout(
            input.execute(call, child.signal),
            item.budget.timeoutMs,
            `batch:${call.name}`,
          )
          const output = truncateOutput(raw, item.budget.maxOutputChars)
          item.status = "completed"
          item.result = output
          item.endedAt = Date.now()
          const durationMs = item.endedAt - (item.startedAt ?? item.endedAt)
          emit({ type: "item.end", runId, itemId: item.id, status: "completed", durationMs })
          return {
            id: call.id,
            name: call.name,
            ok: true,
            output,
            status: "completed" as const,
            capability: call.capability,
            waveIndex,
            durationMs,
          } satisfies BatchResult
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const cancelled = child.signal.aborted || runController.signal.aborted
          item.status = cancelled ? "cancelled" : "failed"
          item.error = message
          item.endedAt = Date.now()
          const durationMs = item.endedAt - (item.startedAt ?? item.endedAt)
          emit({ type: "item.end", runId, itemId: item.id, status: item.status, durationMs })
          return {
            id: call.id,
            name: call.name,
            ok: false,
            output: message,
            status: item.status,
            capability: call.capability,
            waveIndex,
            durationMs,
          } satisfies BatchResult
        } finally {
          runController.signal.removeEventListener("abort", onRunAbort)
        }
      })

      maxActive = Math.max(maxActive, stats.maxActive)
      results.push(...waveResults)
    }
  } finally {
    if (budgetTimer) clearTimeout(budgetTimer)
    parent?.removeEventListener("abort", onParentAbort)
  }

  const durationMs = Date.now() - started
  const synthesis = synthesizeBatchResult(results, {
    maxPerCallChars: Math.min(500, config.maxOutputChars),
    maxSynthesisChars: config.maxSynthesisChars,
    planSummary,
  })

  const report: BatchRunReport = {
    runId,
    parentId: input.parentId,
    waves: input.waves.length,
    calls: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && r.status !== "cancelled").length,
    cancelled: results.filter((r) => r.status === "cancelled").length,
    maxActive,
    durationMs,
    planSummary,
    synthesis,
    results,
    items,
  }

  emit({ type: "run.end", report })
  return report
}

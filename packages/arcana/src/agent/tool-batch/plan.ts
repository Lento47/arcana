import { capabilityOrder, classifyMany } from "./classify.js"
import { attachDependsOn, planPathWaves } from "./dag.js"
import type { BatchConfig, ClassifiedCall, ToolCallSpec, WorkItem } from "./types.js"
import { BatchSizeError, BatchToolDeniedError, DEFAULT_BATCH_CONFIG } from "./types.js"

/**
 * Capability-tier waves, then path-conflict sub-waves within each tier (Phase 2).
 * Reads → network → write → shell/unknown.
 * Within a tier, overlapping write/read sets serialize (later depends on earlier).
 */
export function planWaves(items: ClassifiedCall[], cwd?: string): ClassifiedCall[][] {
  const buckets = new Map<number, ClassifiedCall[]>()
  for (const item of items) {
    const order = capabilityOrder(item.capability)
    const list = buckets.get(order) ?? []
    list.push(item)
    buckets.set(order, list)
  }
  const waves: ClassifiedCall[][] = []
  for (const key of [...buckets.keys()].sort((a, b) => a - b)) {
    const tier = buckets.get(key)!
    waves.push(...planPathWaves(tier, cwd))
  }
  return waves
}

export function concurrencyForCapability(
  capability: ClassifiedCall["capability"],
  config: BatchConfig,
): number {
  switch (capability) {
    case "read":
      return config.readConcurrency
    case "network":
      return config.networkConcurrency
    case "write":
    case "verify":
    case "shell":
    case "model":
    case "unknown":
      return config.writeConcurrency
    default:
      return 1
  }
}

export type ValidatedBatch = {
  items: ClassifiedCall[]
  waves: ClassifiedCall[][]
  config: BatchConfig
}

/**
 * Validate size + allowlist, classify, and produce capability waves.
 */
export function validateAndPlanBatch(
  calls: Array<{ tool: string; args?: Record<string, unknown> }>,
  config: Partial<BatchConfig> = {},
): ValidatedBatch {
  const cfg: BatchConfig = { ...DEFAULT_BATCH_CONFIG, ...config, allowlist: config.allowlist ?? DEFAULT_BATCH_CONFIG.allowlist }

  if (calls.length > cfg.maxCalls) {
    throw new BatchSizeError(calls.length, cfg.maxCalls)
  }

  const specs: ToolCallSpec[] = calls.map((call, index) => {
    const name = call.tool
    if (!cfg.allowlist.has(name)) {
      throw new BatchToolDeniedError(name, "not on nested batch allowlist")
    }
    return {
      id: `batch-${index}-${name}`,
      name,
      input: call.args ?? {},
    }
  })

  const items = classifyMany(specs)
  // Defense in depth: classified write/shell never enter batch even if allowlist drifts.
  for (const item of items) {
    if (item.capability === "write" || item.capability === "shell" || item.capability === "unknown") {
      throw new BatchToolDeniedError(item.name, `capability "${item.capability}" cannot run inside batch`)
    }
  }

  return {
    items,
    waves: planWaves(items),
    config: cfg,
  }
}

export function toWorkItems(
  calls: ClassifiedCall[],
  opts: {
    timeoutMs: number
    maxOutputChars?: number
    runId?: string
    parentId?: string
    cwd?: string
  },
): WorkItem[] {
  const runId = opts.runId ?? `batch_${Date.now().toString(36)}`
  return attachDependsOn(calls, opts.cwd).map((call) => ({
    ...call,
    budget: {
      timeoutMs: opts.timeoutMs,
      maxOutputChars: opts.maxOutputChars ?? DEFAULT_BATCH_CONFIG.maxOutputChars,
    },
    status: "pending" as const,
    runId,
    parentId: opts.parentId,
  }))
}

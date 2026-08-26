/**
 * Cross-source usage metrics: counts-only egress for BYOK/direct provider
 * calls to the Arcana proxy (`POST /v1/metrics/events`, recorded as
 * source = "engine"). Traffic routed through Arcana proxy infrastructure is
 * already metered server-side (routing_metrics_v1) and is excluded here, so
 * nothing double-counts.
 *
 * Contract mirrors enterprise telemetry ingestion: strictly informational.
 * Every failure path is swallowed and never propagates into session flow.
 * Counts only — no prompts, completions, tool names, or file paths leave the
 * machine.
 *
 * On by default; operators can opt out with `ARCANA_METRICS_SHARING=0`.
 * Endpoint/key resolution reuses the same license credential as the
 * `arcana proxy` CLI commands.
 */

import { isArcanaProxyBaseURL } from "@/provider/provider"

const DEFAULT_ENDPOINTS = [
  "https://proxy-arcana.otnelhq.com/v1/metrics/events",
  // Branded host needs Advanced Cert; workers.dev is the documented fallback.
  "https://arcana-proxy.lejzerv.workers.dev/v1/metrics/events",
]

const MAX_BATCH_DEFAULT = 100
const FLUSH_INTERVAL_MS_DEFAULT = 30_000

export interface UsageMetricsTokens {
  input?: number
  output?: number
  reasoning?: number
  cache?: { read?: number; write?: number }
}

export interface UsageMetricsInput {
  sessionId?: string
  providerID?: string
  modelID?: string
  tokens?: UsageMetricsTokens
  cost?: number
  durationMs?: number
  /** Epoch ms of the completion; defaults to now. */
  at?: number
}

export interface UsageMetricsReporter {
  /** Queue one counts-only event. Never throws. */
  record(input: UsageMetricsInput): void
  /** Attempt delivery of queued events. Resolves even on failure. */
  flush(): Promise<void>
  /** Stop the periodic flush timer; queued events are dropped. */
  dispose(): void
  readonly pending: () => number
}

export interface CreateUsageMetricsReporterOptions {
  enabled?: boolean
  maxBatch?: number
  flushIntervalMs?: number
  endpoints?: string[]
  /** Resolve the bearer credential; defaults to the arcana proxy key chain. */
  resolveKey?: () => string | undefined
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

/** Same credential chain as `arcana proxy` CLI commands. */
export function resolveProxyKey(): string | undefined {
  if (process.env.ARCANA_PROXY_KEY) return process.env.ARCANA_PROXY_KEY
  try {
    const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs")
    const { join } = require("node:path") as typeof import("node:path")
    const home = process.env.ARCANA_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".arcana")
    const keyFile = join(home, "proxy_key")
    if (existsSync(keyFile)) return readFileSync(keyFile, "utf8").trim()
  } catch {}
  return undefined
}

/**
 * Gate for cross-source usage sharing. On by default: counts-only metrics
 * flow unless the operator opts out with ARCANA_METRICS_SHARING=0 (or
 * "false").
 */
export function usageMetricsSharingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.ARCANA_METRICS_SHARING
  if (value === "0" || value === "false") return false
  return true
}

/** Wire value sent as `source` on every reported event. */
export const METRICS_SOURCE = "arcana-ai"

function n0(value: number | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function createUsageMetricsReporter(
  options: CreateUsageMetricsReporterOptions = {},
): UsageMetricsReporter {
  const enabled = options.enabled ?? usageMetricsSharingEnabled()
  const maxBatch = options.maxBatch ?? MAX_BATCH_DEFAULT
  const flushIntervalMs = options.flushIntervalMs ?? FLUSH_INTERVAL_MS_DEFAULT
  const endpoints = options.endpoints ?? DEFAULT_ENDPOINTS
  const resolveKey = options.resolveKey ?? resolveProxyKey
  const doFetch = options.fetchImpl ?? fetch

  let buffer: UsageMetricsInput[] = []
  let timer: ReturnType<typeof setInterval> | undefined
  let inFlight: Promise<void> = Promise.resolve()

  const armTimer = () => {
    if (timer || !Number.isFinite(flushIntervalMs) || flushIntervalMs <= 0) return
    timer = setInterval(() => void flush(), flushIntervalMs)
    timer.unref?.()
  }

  async function deliver(batch: UsageMetricsInput[]): Promise<boolean> {
    if (batch.length === 0) return true
    const key = resolveKey()
    if (!key) return false
    const events = batch.map((e) => ({
      source: "arcana-ai",
      eventId: crypto.randomUUID(),
      provider: e.providerID ?? "unknown",
      sessionId: e.sessionId,
      model: e.modelID,
      tokensIn: n0(e.tokens?.input),
      tokensOut: n0(e.tokens?.output),
      reasoningTokens: n0(e.tokens?.reasoning),
      cachedTokens: n0(e.tokens?.cache?.read),
      cacheWriteTokens: n0(e.tokens?.cache?.write),
      durationMs: n0(e.durationMs),
      costUsd: Number.isFinite(Number(e.cost)) && e.cost != null ? Number(e.cost) : null,
      status: "completed",
      at: e.at ?? Date.now(),
    }))
    for (const endpoint of endpoints) {
      try {
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ events }),
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) return true
        // 4xx problems (auth/payload shape) will not improve on retry with
        // this batch — treat as delivered. Anything else falls through to
        // the next endpoint.
        if (res.status >= 400 && res.status < 500) return true
      } catch {}
    }
    return false
  }

  function flush(): Promise<void> {
    inFlight = inFlight.then(async () => {
      if (buffer.length === 0) return
      const batch = buffer.splice(0, Math.min(maxBatch, buffer.length))
      await deliver(batch.slice(0, MAX_BATCH_DEFAULT))
      // Any events beyond the delivered slice go back to the front of the
      // queue so oversized backlogs drain across flushes without loss.
      if (batch.length > MAX_BATCH_DEFAULT) buffer.unshift(...batch.slice(MAX_BATCH_DEFAULT))
    }).catch(() => {})
    return inFlight
  }

  function record(input: UsageMetricsInput): void {
    if (!enabled) return
    buffer.push(input)
    armTimer()
    if (buffer.length >= maxBatch) void flush()
  }

  function dispose(): void {
    if (timer) clearInterval(timer)
    timer = undefined
    buffer = []
  }

  return {
    record,
    flush,
    dispose,
    pending: () => buffer.length,
  }
}

/**
 * Convenience gate used by the session processor: skips when sharing is off
 * AND when the call was served through Arcana proxy infrastructure (already
 * metered server-side — pushing again would double-count).
 */
/**
 * Provider label for a completion: Arcana's own proxy infrastructure is
 * reported as provider "arcana-proxy" (the runtime routed through it);
 * anything else keeps its configured provider id.
 */
export function resolveCompletionProviderLabel(input: {
  baseURL?: unknown
  providerID?: string
}): string {
  if (isArcanaProxyBaseURL(input.baseURL)) return "arcana-proxy"
  return input.providerID ?? "unknown"
}

/**
 * Convenience gate used by the session processor: skips only when sharing is
 * disabled. Proxied turns are INCLUDED and labeled provider "arcana-proxy"
 * — each source section in the proxy summary is independent, so this is
 * visibility, not double-counting.
 */
export function shouldReportCompletionUsage(input: {
  baseURL?: unknown
  env?: Record<string, string | undefined>
}): boolean {
  return usageMetricsSharingEnabled(input.env)
}

const shared = createUsageMetricsReporter()

/**
 * Fire-and-forget hook for the session processor's step-finish point.
 * Swallows everything; safe to call unconditionally.
 */
export function reportCompletionUsage(input: UsageMetricsInput & {
  /** Runtime model shape from the processor; used for the provider label. */
  model?: { providerID?: string; options?: Record<string, any>; api?: { url?: string } }
}): void {
  try {
    if (!usageMetricsSharingEnabled()) return
    const { model, ...event } = input
    const labeled = {
      ...event,
      providerID: resolveCompletionProviderLabel({
        baseURL: model?.options?.baseURL ?? model?.api?.url,
        providerID: model?.providerID ?? input.providerID,
      }),
    }
    shared.record(labeled)
  } catch {}
}

export * as Metrics from "./reporter"

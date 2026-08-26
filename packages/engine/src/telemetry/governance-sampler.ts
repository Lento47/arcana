/**
 * Governance metering sampler — counts-only aggregation of published session
 * events, flushed as windows to the Arcana proxy
 * (`POST /v1/governance/rollup`, attributed to the operator license).
 *
 * Privacy contract: counters ONLY. No prompt text, paths, principals, tool
 * arguments, or any free-text field is ever serialized. Sharing off ⇒ zero
 * network. Fail-open everywhere: metering can never break event flow.
 */

const GOVERNANCE_ROLLUP_ENDPOINTS = [
  "https://proxy-arcana.otnelhq.com/v1/governance/rollup",
  "https://arcana-proxy.lejzerv.workers.dev/v1/governance/rollup",
]

const WINDOW_MS_DEFAULT = 60_000
const MAX_BUFFERED_WINDOWS = 120
const MAX_COUNTER_KEY = 64

/** event.type → counter family. Unknown types are ignored (return null). */
const COUNTER_FOR_TYPE: Record<string, string> = {
  "session.started": "turns_started",
  "session.completed": "turns_completed",
  "session.crashed": "turns_crashed",
  "session.drive_decision": "drive_decisions",
  "authorization.allowed": "authority_allowed",
  "authorization.denied": "authority_denied",
  "authorization.approval_required": "authority_approvals_required",
  "authorization.executed": "authority_executed",
  "authorization.execution_failed": "authority_execution_failed",
  "authorization.stale": "authority_stale",
  "authorization.requested": "authority_requests",
  "permission.allowed": "permissions_allowed",
  "capability.created": "capabilities_created",
  "capability.revoked": "capabilities_revoked",
  "capability.exhausted": "capabilities_exhausted",
  "claim.created": "claims_created",
  "obligation.created": "obligations_created",
  "obligation.resolved": "obligations_resolved",
  "verification.recorded": "verifications_recorded",
  "completion.resolved": "completions_resolved",
  "intent.binding_created": "intent_bindings_created",
  "intent.binding_revoked": "intent_bindings_revoked",
  "intent.compatibility_mode": "intent_compat_mode",
}

export function governanceCounterFor(eventType: string): string | null {
  return COUNTER_FOR_TYPE[eventType] ?? null
}

export interface GovernanceSampler {
  /** Count one published event. Never throws. */
  record(eventType: string, at?: number): void
  /** Attempt delivery of all closed windows. Resolves even on failure. */
  flush(): Promise<void>
  dispose(): void
  readonly pendingWindows: () => number
}

export interface CreateGovernanceSamplerOptions {
  enabled?: boolean
  windowMs?: number
  endpoints?: string[]
  resolveKey?: () => string | undefined
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

function bump(counters: Record<string, number>, key: string, by = 1): void {
  counters[key] = (counters[key] ?? 0) + by
}

export function createGovernanceSampler(
  options: CreateGovernanceSamplerOptions = {},
): GovernanceSampler {
  const enabled = options.enabled ?? true
  const windowMs = options.windowMs ?? WINDOW_MS_DEFAULT
  const endpoints = options.endpoints ?? GOVERNANCE_ROLLUP_ENDPOINTS
  const resolveKey = options.resolveKey ?? (() => process.env.ARCANA_PROXY_KEY)
  const doFetch = options.fetchImpl ?? fetch

  let openWindow: { start: number; counters: Record<string, number> } | undefined
  let closed: Array<{ start: number; counters: Record<string, number> }> = []
  let timer: ReturnType<typeof setInterval> | undefined

  const armTimer = () => {
    if (timer || !Number.isFinite(windowMs) || windowMs <= 0) return
    timer = setInterval(() => void flush(), Math.max(5_000, windowMs))
    timer.unref?.()
  }

  async function deliver(
    windows: Array<{ start: number; counters: Record<string, number> }>,
  ): Promise<{ delivered: boolean; retryable: boolean }> {
    if (windows.length === 0) return { delivered: true, retryable: false }
    const key = resolveKey()
    if (!key) return { delivered: false, retryable: false } // no credential: drop
    const body = JSON.stringify({
      windows: windows.map((w) => ({ windowStart: w.start, counters: w.counters })),
    })
    for (const endpoint of endpoints) {
      try {
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body,
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) return { delivered: true, retryable: false }
        if (res.status >= 400 && res.status < 500) return { delivered: true, retryable: false } // won't improve on retry
      } catch {}
    }
    return { delivered: false, retryable: true }
  }

  async function flush(): Promise<void> {
    // An explicit flush closes the open window so callers get deterministic
    // delivery of everything recorded so far.
    if (openWindow) {
      closed.push(openWindow)
      openWindow = undefined
    }
    if (closed.length === 0) return
    const batch = closed.splice(0, MAX_BUFFERED_WINDOWS)
    const outcome = await deliver(batch)
    if (!outcome.delivered && outcome.retryable) {
      // Transport failure: requeue (bounded) oldest-first so a transient
      // outage retries without unbounded growth. Non-retryable outcomes
      // (no credential / 4xx) drop the batch permanently.
      closed = [...batch.slice(-MAX_BUFFERED_WINDOWS), ...closed]
    }
  }

  function record(eventType: string, at?: number): void {
    if (!enabled) return
    const counter = governanceCounterFor(eventType)
    if (!counter) return
    const now = at ?? Date.now()
    const windowStart = Math.floor(now / windowMs) * windowMs
    if (!openWindow || openWindow.start !== windowStart) {
      if (openWindow) closed.push(openWindow)
      openWindow = { start: windowStart, counters: {} }
      armTimer()
      if (closed.length > 0) void flush()
    }
    bump(openWindow.counters, counter)
    if (Object.keys(openWindow.counters).length > 0 && closed.length >= MAX_BUFFERED_WINDOWS) {
      void flush()
    }
  }

  function dispose(): void {
    if (timer) clearInterval(timer)
    timer = undefined
    closed = []
    openWindow = undefined
  }

  return {
    record,
    flush,
    dispose,
    pendingWindows: () => closed.length + (openWindow ? 1 : 0),
  }
}

/** Shared process-wide sampler for the event bridge. */
export const governanceSampler = createGovernanceSampler()

export * as GovernanceTelemetry from "./governance-sampler"
